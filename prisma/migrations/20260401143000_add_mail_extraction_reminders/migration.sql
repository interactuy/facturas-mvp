CREATE TABLE "MailExtractionReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mailExtractionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "dueDateSnapshot" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailExtractionReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailExtractionReminder_mailExtractionId_channel_kind_dueDateSn_key" ON "MailExtractionReminder"("mailExtractionId", "channel", "kind", "dueDateSnapshot");
CREATE INDEX "MailExtractionReminder_userId_idx" ON "MailExtractionReminder"("userId");
CREATE INDEX "MailExtractionReminder_mailExtractionId_idx" ON "MailExtractionReminder"("mailExtractionId");
CREATE INDEX "MailExtractionReminder_status_idx" ON "MailExtractionReminder"("status");

ALTER TABLE "MailExtractionReminder" ADD CONSTRAINT "MailExtractionReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MailExtractionReminder" ADD CONSTRAINT "MailExtractionReminder_mailExtractionId_fkey" FOREIGN KEY ("mailExtractionId") REFERENCES "MailExtraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
