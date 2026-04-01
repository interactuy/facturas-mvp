ALTER TABLE "User"
ADD COLUMN "phoneNumber" TEXT;

ALTER TABLE "MailExtractionReminder"
ALTER COLUMN "recipientEmail" DROP NOT NULL;

ALTER TABLE "MailExtractionReminder"
ADD COLUMN "recipientPhone" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "repliedAt" TIMESTAMP(3),
ADD COLUMN "inboundBody" TEXT;

CREATE INDEX "MailExtractionReminder_channel_idx" ON "MailExtractionReminder"("channel");
CREATE INDEX "MailExtractionReminder_providerMessageId_idx" ON "MailExtractionReminder"("providerMessageId");
