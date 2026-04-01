import { handleInboundWhatsAppReply } from "../../../../lib/whatsapp/service";

function verifyWebhookRequest(request: Request) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();

  if (!verifyToken) {
    throw new Error("Missing WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  }

  const tokenFromHeader = request.headers.get("x-webhook-verify-token")?.trim();
  const authToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  return tokenFromHeader === verifyToken || authToken === verifyToken;
}

export async function POST(request: Request) {
  try {
    if (!verifyWebhookRequest(request)) {
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    let fromPhone: string | null = null;
    let body: string | null = null;
    let providerMessageId: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      fromPhone = String(formData.get("From") ?? "");
      body = String(formData.get("Body") ?? "");
      providerMessageId = String(formData.get("MessageSid") ?? "");
    } else {
      const payload = (await request.json().catch(() => null)) as
        | {
            from?: string;
            body?: string;
            providerMessageId?: string;
          }
        | null;

      fromPhone = payload?.from ?? null;
      body = payload?.body ?? null;
      providerMessageId = payload?.providerMessageId ?? null;
    }

    if (!fromPhone || !body) {
      return Response.json(
        { ok: false, error: "Missing inbound WhatsApp fields" },
        { status: 400 },
      );
    }

    await handleInboundWhatsAppReply({
      fromPhone,
      body,
      providerMessageId,
    });

    return new Response("<Response></Response>", {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown WhatsApp webhook error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
