import { GmailMailProviderClient } from "./providers/gmail";
import { OutlookMailProviderClient } from "./providers/outlook";
import type { MailProvider, MailProviderClient } from "./types";

export function getMailProviderClient(
  provider: MailProvider,
  mailConnection?: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
    email?: string | null;
  },
): MailProviderClient {
  switch (provider) {
    case "gmail":
      if (!mailConnection) {
        throw new Error("Gmail provider requires a mail connection");
      }

      return new GmailMailProviderClient(mailConnection);
    case "outlook":
      return new OutlookMailProviderClient();
    default:
      throw new Error(`Unsupported mail provider: ${provider}`);
  }
}
