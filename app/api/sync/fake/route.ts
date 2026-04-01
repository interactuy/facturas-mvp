import { getMailProviderClient } from "../../../../lib/mail";
import type { MailProvider } from "../../../../lib/mail/types";
import { prisma } from "../../../../lib/prisma";

function isMailProvider(value: unknown): value is MailProvider {
  return value === "gmail" || value === "outlook";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provider = body?.provider;

    if (!isMailProvider(provider)) {
      return Response.json(
        { ok: false, error: 'Invalid provider. Expected "gmail" or "outlook".' },
        { status: 400 },
      );
    }

    const user =
      (await prisma.user.findFirst()) ??
      (await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test User",
        },
      }));

    const mailConnection =
      (await prisma.mailConnection.findFirst({
        where: {
          userId: user.id,
          provider,
        },
      })) ??
      (await prisma.mailConnection.create({
        data: {
          userId: user.id,
          provider,
          email: `test+${provider}@example.com`,
        },
      }));

    const client = getMailProviderClient(provider, {
      accessToken: mailConnection.accessToken,
      refreshToken: mailConnection.refreshToken,
      tokenExpiry: mailConnection.tokenExpiry,
      email: mailConnection.email,
    });
    const messages = await client.listRelevantMessages({ pageSize: 5 });

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
      provider,
      syncedCount: messages.length,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
