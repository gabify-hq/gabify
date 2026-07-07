-- CreateEnum
CREATE TYPE "BankRuleMatchType" AS ENUM ('CONTAINS', 'EQUALS', 'SIMPLE_REGEX');

-- CreateEnum
CREATE TYPE "BankRuleAction" AS ENUM ('IGNORE', 'SUGGEST_CLIENT');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ReconciliationEntry" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "documentIds" TEXT[],
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "ignoreReason" TEXT,
    "ruleId" TEXT,
    "reconciledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankRule" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "matchType" "BankRuleMatchType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "amountMinCents" INTEGER,
    "amountMaxCents" INTEGER,
    "action" "BankRuleAction" NOT NULL,
    "targetClientId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationEntry_bankTransactionId_key" ON "ReconciliationEntry"("bankTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationEntry_officeId_idx" ON "ReconciliationEntry"("officeId");

-- CreateIndex
CREATE INDEX "BankRule_officeId_active_priority_idx" ON "BankRule"("officeId", "active", "priority");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reconciledEntryId_fkey" FOREIGN KEY ("reconciledEntryId") REFERENCES "ReconciliationEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationEntry" ADD CONSTRAINT "ReconciliationEntry_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationEntry" ADD CONSTRAINT "ReconciliationEntry_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationEntry" ADD CONSTRAINT "ReconciliationEntry_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BankRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_targetClientId_fkey" FOREIGN KEY ("targetClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

