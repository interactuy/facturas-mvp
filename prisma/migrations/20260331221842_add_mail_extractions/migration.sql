-- CreateTable
CREATE TABLE "MailExtraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "issuerName" TEXT,
    "issuerEmail" TEXT,
    "amountValue" DECIMAL(12,2),
    "currency" TEXT,
    "dueDate" TIMESTAMP(3),
    "dueDateEstimated" BOOLEAN NOT NULL DEFAULT false,
    "paidStatus" TEXT,
    "documentType" TEXT,
    "category" TEXT,
    "confidence" DECIMAL(4,3),
    "extractionMethod" TEXT,
    "rawExtractionJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailExtraction_emailMessageId_key" ON "MailExtraction"("emailMessageId");

-- CreateIndex
CREATE INDEX "MailExtraction_userId_idx" ON "MailExtraction"("userId");

-- CreateIndex
CREATE INDEX "MailExtraction_dueDate_idx" ON "MailExtraction"("dueDate");

-- CreateIndex
CREATE INDEX "MailExtraction_paidStatus_idx" ON "MailExtraction"("paidStatus");

-- CreateIndex
CREATE INDEX "MailExtraction_documentType_idx" ON "MailExtraction"("documentType");

-- AddForeignKey
ALTER TABLE "MailExtraction" ADD CONSTRAINT "MailExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailExtraction" ADD CONSTRAINT "MailExtraction_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
