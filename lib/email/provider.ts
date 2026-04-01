import "server-only";

type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function sendEmail(input: EmailSendInput) {
  const apiKey = getRequiredEnv("EMAIL_PROVIDER_API_KEY");
  const from = getRequiredEnv("EMAIL_FROM");
  const provider = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();

  if (provider !== "resend") {
    throw new Error(`Unsupported email provider: ${provider}`);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message ??
        data?.message ??
        "Failed to send email via provider",
    );
  }

  return {
    id: data?.id ?? null,
    provider,
  };
}
