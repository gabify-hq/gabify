-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "reconciledEntryId" TEXT;

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "reconciliationToleranceCents" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "ReconciliationSuggestion" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "scoreTotal" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "autoMatch" BOOLEAN NOT NULL DEFAULT false,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationSuggestion_officeId_status_idx" ON "ReconciliationSuggestion"("officeId", "status");

-- CreateIndex
CREATE INDEX "ReconciliationSuggestion_documentId_idx" ON "ReconciliationSuggestion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationSuggestion_bankTransactionId_documentId_key" ON "ReconciliationSuggestion"("bankTransactionId", "documentId");

-- AddForeignKey
ALTER TABLE "ReconciliationSuggestion" ADD CONSTRAINT "ReconciliationSuggestion_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationSuggestion" ADD CONSTRAINT "ReconciliationSuggestion_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationSuggestion" ADD CONSTRAINT "ReconciliationSuggestion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

