import "server-only";

export type SendWhatsAppMessageInput = {
  to: string;
  body: string;
};

export type SendWhatsAppMessageResult = {
  provider: string;
  messageId: string | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeTwilioNumber(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

async function sendWithTwilio(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const accountSid = getRequiredEnv("WHATSAPP_ACCOUNT_SID");
  const authToken = getRequiredEnv("WHATSAPP_AUTH_TOKEN");
  const from = normalizeTwilioNumber(getRequiredEnv("WHATSAPP_FROM"));
  const to = normalizeTwilioNumber(input.to);

  const formData = new URLSearchParams();
  formData.set("From", from);
  formData.set("To", to);
  formData.set("Body", input.body);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    },
  );

  const data = (await response.json().catch(() => null)) as
    | { sid?: string; message?: string }
    | { code?: number; message?: string }
    | null;

  if (!response.ok) {
    throw new Error(data?.message ?? "Failed to send WhatsApp message");
  }

  return {
    provider: "twilio",
    messageId:
      data && "sid" in data && typeof data.sid === "string" ? data.sid : null,
  };
}

export async function sendWhatsAppMessage(input: SendWhatsAppMessageInput) {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "twilio")
    .trim()
    .toLowerCase();

  switch (provider) {
    case "twilio":
      return sendWithTwilio(input);
    default:
      throw new Error(`Unsupported WhatsApp provider: ${provider}`);
  }
}
