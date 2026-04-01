import { auth } from "../../../../auth";
import { prisma } from "../../../../lib/prisma";
import { runReminderEmails } from "../../../../lib/reminders/service";

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

    const result = await runReminderEmails({
      userId: user.id,
      daysAhead: 7,
    });

    return Response.json({
      ok: true,
      sentCount: result.sentCount,
      reminders: result.reminders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown reminder execution error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
