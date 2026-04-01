export const MAIL_EXTRACTION_STATUSES = [
  "pendiente",
  "pagada",
  "ignorada",
] as const;

export type MailExtractionStatus =
  (typeof MAIL_EXTRACTION_STATUSES)[number];

export function isMailExtractionStatus(
  value: unknown,
): value is MailExtractionStatus {
  return (
    typeof value === "string" &&
    MAIL_EXTRACTION_STATUSES.includes(value as MailExtractionStatus)
  );
}
