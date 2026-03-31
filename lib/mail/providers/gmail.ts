import { google, type gmail_v1 } from "googleapis";
import type {
  MailAttachment,
  MailMessageDetail,
  MailMessageSummary,
  MailProviderClient,
  MailProviderConnection,
} from "../types";

const DEFAULT_GMAIL_QUERY =
  '(factura OR invoice OR vencimiento OR bill OR statement)';
const DEFAULT_MAX_RESULTS = 10;

type GmailHeaderName = "Subject" | "From";

export class GmailMailProviderClient implements MailProviderClient {
  private readonly email: string;
  private readonly gmail: gmail_v1.Gmail;

  constructor(connection: MailProviderConnection) {
    if (!connection.email?.trim()) {
      throw new Error("Gmail provider requires the mail connection email");
    }

    this.email = connection.email.trim();

    const clientId = process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.AUTH_GOOGLE_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Missing AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET for Gmail API access",
      );
    }

    if (!connection.accessToken && !connection.refreshToken) {
      throw new Error(
        `MailConnection for ${this.email} does not have Google OAuth tokens`,
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

    oauth2Client.setCredentials({
      access_token: connection.accessToken ?? undefined,
      refresh_token: connection.refreshToken ?? undefined,
      expiry_date: connection.tokenExpiry?.getTime(),
    });

    this.gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });
  }

  async listRelevantMessages(args?: {
    query?: string;
    maxResults?: number;
  }): Promise<MailMessageSummary[]> {
    const listResponse = await this.gmail.users.messages.list({
      userId: "me",
      q: args?.query ?? DEFAULT_GMAIL_QUERY,
      maxResults: args?.maxResults ?? DEFAULT_MAX_RESULTS,
    });

    const messages = listResponse.data.messages ?? [];

    const summaries = await Promise.all(
      messages
        .filter((message): message is gmail_v1.Schema$Message => Boolean(message.id))
        .map(async (message) => {
          const detail = await this.gmail.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
          });

          return mapMessageSummary(detail.data);
        }),
    );

    return summaries.filter(
      (summary): summary is MailMessageSummary => summary !== null,
    );
  }

  async getMessage(messageId: string): Promise<MailMessageDetail> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const message = response.data;
    const summary = mapMessageSummary(message);

    if (!summary) {
      throw new Error(`Gmail message ${messageId} was not found`);
    }

    return {
      summary,
      bodyText: extractPlainTextBody(message.payload),
      attachments: extractAttachmentMetadata(message.payload),
    };
  }
}

function mapMessageSummary(
  message: gmail_v1.Schema$Message,
): MailMessageSummary | null {
  if (!message.id) {
    return null;
  }

  const fromHeader = getHeader(message.payload?.headers, "From");
  const from = parseMailbox(fromHeader);

  return {
    id: message.id,
    threadId: message.threadId ?? null,
    subject: getHeader(message.payload?.headers, "Subject"),
    fromEmail: from.email,
    fromName: from.name,
    snippet: message.snippet ?? null,
    internalDate: parseInternalDate(message.internalDate),
    hasAttachments: hasAttachments(message.payload),
  };
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: GmailHeaderName,
): string | null {
  const header = headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  );

  return header?.value?.trim() || null;
}

function parseMailbox(value: string | null): {
  email: string | null;
  name: string | null;
} {
  if (!value) {
    return {
      email: null,
      name: null,
    };
  }

  const match = value.match(/^(.*)<(.+)>$/);

  if (!match) {
    const email = value.trim();

    return {
      email: email || null,
      name: null,
    };
  }

  const rawName = match[1]?.trim().replace(/^"|"$/g, "");
  const rawEmail = match[2]?.trim();

  return {
    email: rawEmail || null,
    name: rawName || null,
  };
}

function parseInternalDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}

function hasAttachments(payload: gmail_v1.Schema$MessagePart | undefined): boolean {
  return extractAttachmentMetadata(payload).length > 0;
}

function extractAttachmentMetadata(
  payload: gmail_v1.Schema$MessagePart | undefined,
): MailAttachment[] {
  if (!payload) {
    return [];
  }

  const attachments: MailAttachment[] = [];
  const stack: gmail_v1.Schema$MessagePart[] = [payload];

  while (stack.length > 0) {
    const part = stack.pop();

    if (!part) {
      continue;
    }

    if (isAttachmentPart(part)) {
      attachments.push({
        id: part.body?.attachmentId ?? part.partId ?? part.filename ?? crypto.randomUUID(),
        filename: part.filename?.trim() || null,
        mimeType: part.mimeType ?? null,
        sizeBytes: part.body?.size ?? null,
      });
    }

    if (part.parts) {
      stack.push(...part.parts);
    }
  }

  return attachments;
}

function isAttachmentPart(part: gmail_v1.Schema$MessagePart): boolean {
  const hasFilename = Boolean(part.filename?.trim());
  const hasAttachmentId = Boolean(part.body?.attachmentId);

  return hasFilename || hasAttachmentId;
}

function extractPlainTextBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!payload) {
    return null;
  }

  const plainTextPart = findBodyPart(payload, "text/plain");

  if (plainTextPart?.body?.data) {
    return decodeBase64Url(plainTextPart.body.data);
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const htmlPart = findBodyPart(payload, "text/html");

  if (htmlPart?.body?.data) {
    return stripHtml(decodeBase64Url(htmlPart.body.data));
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }

  return null;
}

function findBodyPart(
  payload: gmail_v1.Schema$MessagePart,
  mimeType: string,
): gmail_v1.Schema$MessagePart | null {
  if (payload.mimeType === mimeType && payload.body?.data) {
    return payload;
  }

  for (const part of payload.parts ?? []) {
    const match = findBodyPart(part, mimeType);

    if (match) {
      return match;
    }
  }

  return null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
