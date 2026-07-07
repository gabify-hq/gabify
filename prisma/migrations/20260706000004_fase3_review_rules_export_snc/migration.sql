-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentStatus" ADD VALUE 'PRE_VALIDATED';
ALTER TYPE "DocumentStatus" ADD VALUE 'VALIDATED';
ALTER TYPE "DocumentStatus" ADD VALUE 'EXPORTED';

-- DropIndex
DROP INDEX "DocumentReview_documentId_key";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountOverrides" JSONB;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "accountCode" TEXT,
ADD COLUMN     "appliedRuleId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "exportBatchId" TEXT,
ADD COLUMN     "sncSource" TEXT,
ADD COLUMN     "suggestedAccountCode" TEXT,
ADD COLUMN     "suggestedVatTreatment" TEXT,
ADD COLUMN     "vatTreatment" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "DocumentReview" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "decision" TEXT NOT NULL DEFAULT 'validate';

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "name" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierRule" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT,
    "supplierNif" TEXT NOT NULL,
    "defaultDocumentType" "DocumentType",
    "defaultAccountCode" TEXT,
    "defaultVatTreatment" TEXT,
    "autoValidate" BOOLEAN NOT NULL DEFAULT false,
    "createdFromReviewId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportBatch" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "r2Key" TEXT,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportDocument" (
    "exportBatchId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportDocument_pkey" PRIMARY KEY ("exportBatchId","documentId")
);

-- CreateTable
CREATE TABLE "SncAccount" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "suggestible" BOOLEAN NOT NULL DEFAULT true,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SncAccount_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_officeId_nif_key" ON "Supplier"("officeId", "nif");

-- CreateIndex
CREATE INDEX "SupplierRule_officeId_supplierNif_idx" ON "SupplierRule"("officeId", "supplierNif");

-- CreateIndex
CREATE INDEX "ExportBatch_officeId_idx" ON "ExportBatch"("officeId");

-- CreateIndex
CREATE INDEX "DocumentReview_documentId_idx" ON "DocumentReview"("documentId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierRule" ADD CONSTRAINT "SupplierRule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportBatch" ADD CONSTRAINT "ExportBatch_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_exportBatchId_fkey" FOREIGN KEY ("exportBatchId") REFERENCES "ExportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
