import { auth } from "../../../../../auth";
import { prisma } from "../../../../../lib/prisma";
import {
  isMailExtractionStatus,
} from "../../../../../lib/mail-extractions/status";

type RequestBody = {
  status?: unknown;
};

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/mail-extractions/[id]/status">,
) {
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

    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as RequestBody | null;

    if (!body || !isMailExtractionStatus(body.status)) {
      return Response.json(
        { ok: false, error: "Invalid status" },
        { status: 400 },
      );
    }

    const existingExtraction = await prisma.mailExtraction.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!existingExtraction) {
      return Response.json(
        { ok: false, error: "Mail extraction not found" },
        { status: 404 },
      );
    }

    const updatedExtraction = await prisma.mailExtraction.update({
      where: {
        id: existingExtraction.id,
      },
      data: {
        status: body.status,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return Response.json({
      ok: true,
      id: updatedExtraction.id,
      status: updatedExtraction.status,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown mail extraction status update error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
