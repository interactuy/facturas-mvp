import { auth } from "../../../../auth";
import { getMailProviderClient } from "../../../../lib/mail";
import { prisma } from "../../../../lib/prisma";

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

    const mailConnection = await prisma.mailConnection.findFirst({
      where: {
        userId: user.id,
        provider: "gmail",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!mailConnection) {
      return Response.json(
        { ok: false, error: "Gmail connection not found" },
        { status: 404 },
      );
    }

    const pendingMessages = await prisma.emailMessage.findMany({
      where: {
        userId: user.id,
        mailConnectionId: mailConnection.id,
        extractionStatus: "pending",
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 10,
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

        return {
          id: message.id,
          externalMessageId: message.externalMessageId,
          bodyText: detail.bodyText,
          hasAttachments: detail.summary.hasAttachments,
          attachmentCount: detail.attachments.length,
          processedAt,
        };
      }),
    );

    return Response.json({
      ok: true,
      enrichedCount: enrichedMessages.length,
      messages: enrichedMessages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Gmail enrich error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
