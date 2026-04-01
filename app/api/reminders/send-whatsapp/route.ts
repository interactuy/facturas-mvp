import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";
import { sendNextWhatsAppReminderForUser } from "../../../../lib/whatsapp/service";

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
      select: { id: true },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    const result = await sendNextWhatsAppReminderForUser({
      userId: user.id,
    });

    return Response.json({
      ok: true,
      remindedRow: result.extraction,
      reminder: result.reminder,
      reminderRecordAction: result.reminderRecordAction,
      providerResult: result.providerResult,
      body: result.body,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown WhatsApp reminder send error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
