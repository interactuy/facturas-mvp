import { auth } from "../../../../auth";
import { getMailProviderClient } from "../../../../lib/mail";
import { prisma } from "../../../../lib/prisma";

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

    const messages = await client.listRelevantMessages({ pageSize: 10 });

    return Response.json({
      ok: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Gmail test error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
