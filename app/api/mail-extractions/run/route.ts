import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";
import { runMailPaymentHeuristics } from "../../../../lib/mail-extractions/heuristics";

export async function POST() {
  try {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    const messages = await prisma.emailMessage.findMany({
      where: {
        userId: user.id,
        extractionStatus: "processed",
        bodyText: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 20,
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

    const results = [];

    for (const message of messages) {
      if (!message.bodyText) {
        continue;
      }

      const extraction = runMailPaymentHeuristics({
        subject: message.subject,
        snippet: message.snippet,
        bodyText: message.bodyText,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        internalDate: message.internalDate,
      });

      const savedExtraction = await prisma.mailExtraction.upsert({
        where: {
          emailMessageId: message.id,
        },
        update: {
          userId: user.id,
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
          userId: user.id,
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

      results.push({
        id: savedExtraction.id,
        emailMessageId: savedExtraction.emailMessageId,
        issuerName: savedExtraction.issuerName,
        issuerEmail: savedExtraction.issuerEmail,
        amountValue: savedExtraction.amountValue,
        currency: savedExtraction.currency,
        dueDate: savedExtraction.dueDate,
        dueDateEstimated: savedExtraction.dueDateEstimated,
        paidStatus: savedExtraction.paidStatus,
        documentType: savedExtraction.documentType,
        category: savedExtraction.category,
        confidence: savedExtraction.confidence,
      });
    }

    return Response.json({
      ok: true,
      extractedCount: results.length,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown mail extraction execution error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
