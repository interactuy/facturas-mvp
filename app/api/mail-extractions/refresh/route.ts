import { auth } from "../../../../auth";
import { refreshRecentMailExtractions } from "../../../../lib/mail-processing/pipeline";
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
      select: { id: true },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    const summary = await refreshRecentMailExtractions(user.id);

    return Response.json({
      ok: true,
      syncedCount: summary.syncedCount,
      enrichedCount: summary.enrichedCount,
      extractedCount: summary.extractedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown mail extraction refresh error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
