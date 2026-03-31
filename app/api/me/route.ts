import { auth } from "../../../auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
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
      include: {
        mailConnections: true,
      },
    });

    if (!user) {
      return Response.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    return Response.json({
      ok: true,
      user,
      mailConnections: user.mailConnections,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
