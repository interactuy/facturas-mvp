export type MailProvider = "gmail" | "outlook";

export type MailProviderConnection = {
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiry?: Date | null;
  email?: string | null;
};

export type MailMessageSummary = {
  id: string;
  threadId: string | null;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  snippet: string | null;
  internalDate: Date | null;
  hasAttachments: boolean;
};

export type MailAttachment = {
  id: string;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type MailMessageDetail = {
  summary: MailMessageSummary;
  bodyText: string | null;
  attachments: MailAttachment[];
};

export interface MailProviderClient {
  listRelevantMessages(args?: {
    query?: string;
    newerThanDays?: number;
    pageSize?: number;
  }): Promise<MailMessageSummary[]>;
  getMessage(messageId: string): Promise<MailMessageDetail>;
}
