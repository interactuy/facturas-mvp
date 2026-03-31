import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return Response.json({ ok: true, userCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
