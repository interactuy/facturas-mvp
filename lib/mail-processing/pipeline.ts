import "server-only";

import { getMailProviderClient } from "../mail";
import { runMailPaymentHeuristics } from "../mail-extractions/heuristics";
import { prisma } from "../prisma";

const DEFAULT_DAYS_BACK = 30;

export type RefreshMailExtractionSummary = {
  syncedCount: number;
  enrichedCount: number;
  extractedCount: number;
};

async function getGmailConnectionForUser(userId: string) {
  return prisma.mailConnection.findFirst({
    where: {
      userId,
      provider: "gmail",
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

function getCutoffDate(daysBack = DEFAULT_DAYS_BACK) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  return cutoff;
}

export async function syncRecentGmailMessages(input: {
  userId: string;
  daysBack?: number;
}) {
  const daysBack = input.daysBack ?? DEFAULT_DAYS_BACK;
  const mailConnection = await getGmailConnectionForUser(input.userId);

  if (!mailConnection) {
    throw new Error("Gmail connection not found");
  }

  const client = getMailProviderClient("gmail", {
    accessToken: mailConnection.accessToken,
    refreshToken: mailConnection.refreshToken,
    tokenExpiry: mailConnection.tokenExpiry,
    email: mailConnection.email,
  });

  const messages = await client.listRelevantMessages({
    newerThanDays: daysBack,
  });

  const existingMessages = await prisma.emailMessage.findMany({
    where: {
      userId: input.userId,
      mailConnectionId: mailConnection.id,
      externalMessageId: {
        in: messages.map((message) => message.id),
      },
    },
    select: {
      id: true,
      externalMessageId: true,
      extractionStatus: true,
    },
  });

  const existingMessagesByExternalId = new Map(
    existingMessages.map((message) => [message.externalMessageId, message]),
  );

  for (const message of messages) {
    const existingMessage = existingMessagesByExternalId.get(message.id);

    if (existingMessage) {
      await prisma.emailMessage.update({
        where: {
          id: existingMessage.id,
        },
        data: {
          userId: input.userId,
          threadId: message.threadId,
          subject: message.subject,
          fromEmail: message.fromEmail,
          fromName: message.fromName,
          snippet: message.snippet,
          internalDate: message.internalDate,
          hasAttachments: message.hasAttachments,
          extractionStatus: existingMessage.extractionStatus,
        },
      });

      continue;
    }

    await prisma.emailMessage.create({
      data: {
        userId: input.userId,
        mailConnectionId: mailConnection.id,
        externalMessageId: message.id,
        threadId: message.threadId,
        subject: message.subject,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        snippet: message.snippet,
        internalDate: message.internalDate,
        hasAttachments: message.hasAttachments,
        extractionStatus: "pending",
      },
    });
  }

  return {
    syncedCount: messages.length,
  };
}

export async function enrichPendingMessages(input: { userId: string }) {
  const mailConnection = await getGmailConnectionForUser(input.userId);

  if (!mailConnection) {
    throw new Error("Gmail connection not found");
  }

  const pendingMessages = await prisma.emailMessage.findMany({
    where: {
      userId: input.userId,
      mailConnectionId: mailConnection.id,
      extractionStatus: "pending",
    },
    orderBy: [
      {
        internalDate: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  const client = getMailProviderClient("gmail", {
    accessToken: mailConnection.accessToken,
    refreshToken: mailConnection.refreshToken,
    tokenExpiry: mailConnection.tokenExpiry,
    email: mailConnection.email,
  });

  const enrichedMessages = await Promise.all(
    pendingMessages.map(async (message) => {
      const detail = await client.getMessage(message.externalMessageId);
      const processedAt = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.emailMessage.update({
          where: {
            id: message.id,
          },
          data: {
            bodyText: detail.bodyText,
            hasAttachments: detail.summary.hasAttachments,
            processedAt,
            extractionStatus: "processed",
          },
        });

        await tx.attachment.deleteMany({
          where: {
            emailMessageId: message.id,
          },
        });

        if (detail.attachments.length > 0) {
          await tx.attachment.createMany({
            data: detail.attachments.map((attachment) => ({
              emailMessageId: message.id,
              externalAttachmentId: attachment.id,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
            })),
          });
        }
      });

      return message.id;
    }),
  );

  return {
    enrichedCount: enrichedMessages.length,
  };
}

export async function extractMailPayments(input: { userId: string }) {
  const cutoffDate = getCutoffDate();
  const messages = await prisma.emailMessage.findMany({
    where: {
      userId: input.userId,
      extractionStatus: "processed",
      OR: [
        {
          internalDate: {
            gte: cutoffDate,
          },
        },
        {
          createdAt: {
            gte: cutoffDate,
          },
        },
      ],
    },
    orderBy: [
      {
        internalDate: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      subject: true,
      snippet: true,
      bodyText: true,
      fromName: true,
      fromEmail: true,
      internalDate: true,
    },
  });

  let extractedCount = 0;

  for (const message of messages) {
    const hasAnyExtractionInput = Boolean(
      message.subject?.trim() ||
        message.snippet?.trim() ||
        message.bodyText?.trim(),
    );

    if (!hasAnyExtractionInput) {
      continue;
    }

    const extraction = runMailPaymentHeuristics({
      subject: message.subject,
      snippet: message.snippet,
      bodyText: message.bodyText ?? "",
      fromName: message.fromName,
      fromEmail: message.fromEmail,
      internalDate: message.internalDate,
    });

    if (!extraction.looksPaymentRelated) {
      await prisma.mailExtraction.deleteMany({
        where: {
          emailMessageId: message.id,
        },
      });
      continue;
    }

    await prisma.mailExtraction.upsert({
      where: {
        emailMessageId: message.id,
      },
      update: {
        userId: input.userId,
        issuerName: extraction.issuerName,
        issuerEmail: extraction.issuerEmail,
        amountValue: extraction.amountValue ?? undefined,
        currency: extraction.currency,
        dueDate: extraction.dueDate ?? undefined,
        dueDateEstimated: extraction.dueDateEstimated,
        paidStatus: extraction.paidStatus,
        documentType: extraction.documentType,
        category: extraction.category,
        confidence: extraction.confidence,
        extractionMethod: "heuristic",
        rawExtractionJson: {
          looksPaymentRelated: extraction.looksPaymentRelated,
          reasons: extraction.reasons,
          matchedFragments: extraction.matchedFragments,
          parsedValues: {
            issuerName: extraction.issuerName,
            issuerEmail: extraction.issuerEmail,
            amountValue: extraction.amountValue,
            currency: extraction.currency,
            dueDate: extraction.dueDate?.toISOString() ?? null,
            dueDateEstimated: extraction.dueDateEstimated,
            paidStatus: extraction.paidStatus,
            documentType: extraction.documentType,
            category: extraction.category,
            confidence: extraction.confidence,
          },
        },
      },
      create: {
        userId: input.userId,
        emailMessageId: message.id,
        issuerName: extraction.issuerName,
        issuerEmail: extraction.issuerEmail,
        amountValue: extraction.amountValue ?? undefined,
        currency: extraction.currency,
        dueDate: extraction.dueDate ?? undefined,
        dueDateEstimated: extraction.dueDateEstimated,
        paidStatus: extraction.paidStatus,
        documentType: extraction.documentType,
        category: extraction.category,
        confidence: extraction.confidence,
        extractionMethod: "heuristic",
        rawExtractionJson: {
          looksPaymentRelated: extraction.looksPaymentRelated,
          reasons: extraction.reasons,
          matchedFragments: extraction.matchedFragments,
          parsedValues: {
            issuerName: extraction.issuerName,
            issuerEmail: extraction.issuerEmail,
            amountValue: extraction.amountValue,
            currency: extraction.currency,
            dueDate: extraction.dueDate?.toISOString() ?? null,
            dueDateEstimated: extraction.dueDateEstimated,
            paidStatus: extraction.paidStatus,
            documentType: extraction.documentType,
            category: extraction.category,
            confidence: extraction.confidence,
          },
        },
      },
    });

    extractedCount += 1;
  }

  return {
    extractedCount,
  };
}

export async function refreshRecentMailExtractions(
  userId: string,
): Promise<RefreshMailExtractionSummary> {
  const syncSummary = await syncRecentGmailMessages({
    userId,
    daysBack: DEFAULT_DAYS_BACK,
  });
  const enrichSummary = await enrichPendingMessages({
    userId,
  });
  const extractSummary = await extractMailPayments({
    userId,
  });

  return {
    syncedCount: syncSummary.syncedCount,
    enrichedCount: enrichSummary.enrichedCount,
    extractedCount: extractSummary.extractedCount,
  };
}
