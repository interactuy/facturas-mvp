import { prisma } from "../../../lib/prisma";

export async function POST() {
  try {
    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst();

      if (!user) {
        user = await tx.user.create({
          data: {
            email: "test@example.com",
            name: "Test User",
          },
        });
      }

      const mailConnection = await tx.mailConnection.create({
        data: {
          userId: user.id,
          provider: "gmail",
          email: "test@gmail.com",
        },
      });

      const emailMessage = await tx.emailMessage.create({
        data: {
          userId: user.id,
          mailConnectionId: mailConnection.id,
          externalMessageId: `test-message-${Date.now()}`,
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          userId: user.id,
          emailMessageId: emailMessage.id,
        },
      });

      return {
        userId: user.id,
        mailConnectionId: mailConnection.id,
        emailMessageId: emailMessage.id,
        invoiceId: invoice.id,
      };
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
