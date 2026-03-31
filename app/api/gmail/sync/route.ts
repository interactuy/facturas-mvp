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

    const client = getMailProviderClient("gmail", {
      accessToken: mailConnection.accessToken,
      refreshToken: mailConnection.refreshToken,
      tokenExpiry: mailConnection.tokenExpiry,
      email: mailConnection.email,
    });

    const messages = await client.listRelevantMessages({ maxResults: 20 });

    await Promise.all(
      messages.map((message) =>
        prisma.emailMessage.upsert({
          where: {
            mailConnectionId_externalMessageId: {
              mailConnectionId: mailConnection.id,
              externalMessageId: message.id,
            },
          },
          update: {
            userId: user.id,
            threadId: message.threadId,
            subject: message.subject,
            fromEmail: message.fromEmail,
            fromName: message.fromName,
            snippet: message.snippet,
            internalDate: message.internalDate,
            hasAttachments: message.hasAttachments,
            extractionStatus: "pending",
          },
          create: {
            userId: user.id,
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
        }),
      ),
    );

    return Response.json({
      ok: true,
      syncedCount: messages.length,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Gmail sync error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
