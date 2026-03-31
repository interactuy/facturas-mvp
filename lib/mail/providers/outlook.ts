import type {
  MailMessageDetail,
  MailMessageSummary,
  MailProviderClient,
} from "../types";

export class OutlookMailProviderClient implements MailProviderClient {
  async listRelevantMessages(): Promise<MailMessageSummary[]> {
    return [];
  }

  async getMessage(messageId: string): Promise<MailMessageDetail> {
    return {
      summary: {
        id: messageId,
        threadId: null,
        subject: null,
        fromEmail: null,
        fromName: null,
        snippet: null,
        internalDate: null,
        hasAttachments: false,
      },
      bodyText: null,
      attachments: [],
    };
  }
}
