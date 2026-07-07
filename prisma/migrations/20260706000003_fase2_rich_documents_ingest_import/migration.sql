-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('EMAIL', 'MANUAL_UPLOAD', 'IMPORT');

-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'SPLIT';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "allowedSenderDomains" TEXT[];

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "atcud" TEXT,
ADD COLUMN     "buyerNif" TEXT,
ADD COLUMN     "contentSha256" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "documentLines" JSONB,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "documentNumberRaw" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "extractionSource" TEXT,
ADD COLUMN     "flags" TEXT[],
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "officeId" TEXT,
ADD COLUMN     "originalFilename" TEXT,
ADD COLUMN     "pageEnd" INTEGER,
ADD COLUMN     "pageStart" INTEGER,
ADD COLUMN     "parentDocumentId" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "source" "DocumentSource" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "suggestedClientId" TEXT,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "supplierNif" TEXT,
ADD COLUMN     "totalAmount" DECIMAL(14,2),
ADD COLUMN     "uploadedByUserId" TEXT,
ADD COLUMN     "vatAmount" DECIMAL(14,2),
ADD COLUMN     "vatBreakdown" JSONB,
ADD COLUMN     "withholdingAmount" DECIMAL(14,2),
ALTER COLUMN "attachmentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ClientIngestAlias" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientIngestAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "clientId" TEXT,
    "proposedMapping" JSONB NOT NULL,
    "confirmedMapping" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "rowsData" JSONB NOT NULL,
    "report" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSplitCache" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "boundaries" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSplitCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientIngestAlias_alias_key" ON "ClientIngestAlias"("alias");

-- CreateIndex
CREATE INDEX "ClientIngestAlias_officeId_idx" ON "ClientIngestAlias"("officeId");

-- CreateIndex
CREATE INDEX "ClientIngestAlias_clientId_idx" ON "ClientIngestAlias"("clientId");

-- CreateIndex
CREATE INDEX "ImportBatch_officeId_idx" ON "ImportBatch"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSplitCache_officeId_sha256_key" ON "DocumentSplitCache"("officeId", "sha256");

-- CreateIndex
CREATE INDEX "Document_officeId_status_idx" ON "Document"("officeId", "status");

-- CreateIndex
CREATE INDEX "Document_officeId_supplierNif_documentNumber_idx" ON "Document"("officeId", "supplierNif", "documentNumber");

-- CreateIndex
CREATE INDEX "Document_parentDocumentId_idx" ON "Document"("parentDocumentId");

-- CreateIndex
CREATE INDEX "Document_contentSha256_idx" ON "Document"("contentSha256");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentDocumentId_fkey" FOREIGN KEY ("parentDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIngestAlias" ADD CONSTRAINT "ClientIngestAlias_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientIngestAlias" ADD CONSTRAINT "ClientIngestAlias_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSplitCache" ADD CONSTRAINT "DocumentSplitCache_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Document.officeId from the email-account chain, then enforce NOT NULL
UPDATE "Document" d
SET "officeId" = ea."officeId"
FROM "EmailAttachment" att
JOIN "InboundEmail" ie ON ie."id" = att."inboundEmailId"
JOIN "EmailAccount" ea ON ea."id" = ie."emailAccountId"
WHERE d."attachmentId" = att."id" AND d."officeId" IS NULL;

DELETE FROM "Document" WHERE "officeId" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "officeId" SET NOT NULL;

-- A8: partial unique index for authoritative-source duplicates (QR/XML).
-- Documents already flagged as duplicates are excluded so both rows can coexist.
CREATE UNIQUE INDEX "Document_office_supplier_number_authoritative_key"
ON "Document"("officeId", "supplierNif", "documentNumber")
WHERE "extractionSource" IN ('QR', 'XML')
  AND "supplierNif" IS NOT NULL
  AND "documentNumber" IS NOT NULL
  AND "parentDocumentId" IS NULL
  AND NOT ('DUPLICATE_SUSPECT' = ANY("flags"));
