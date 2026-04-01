ALTER TABLE "MailExtraction"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pendiente';

CREATE INDEX "MailExtraction_status_idx" ON "MailExtraction"("status");
