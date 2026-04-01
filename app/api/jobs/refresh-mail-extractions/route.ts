import { authorizeJobRequest } from "../../../../lib/jobs/auth";
import { refreshRecentMailExtractions } from "../../../../lib/mail-processing/pipeline";

export async function POST(request: Request) {
  try {
    if (!authorizeJobRequest(request)) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { userId?: string }
      | null;

    if (!body?.userId) {
      return Response.json(
        { ok: false, error: "Missing userId" },
        { status: 400 },
      );
    }

    const summary = await refreshRecentMailExtractions(body.userId);

    return Response.json({
      ok: true,
      syncedCount: summary.syncedCount,
      enrichedCount: summary.enrichedCount,
      extractedCount: summary.extractedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown refresh job error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
