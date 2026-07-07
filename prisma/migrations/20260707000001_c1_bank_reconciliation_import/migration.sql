-- CreateEnum
CREATE TYPE "BankImportStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('UNRECONCILED', 'SUGGESTED', 'RECONCILED', 'IGNORED');

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mappingSource" TEXT NOT NULL,
    "proposedMapping" JSONB NOT NULL,
    "confirmedMapping" JSONB,
    "rowsData" JSONB NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BankImportStatus" NOT NULL DEFAULT 'PENDING',
    "errorReport" JSONB,
    "importedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceCents" INTEGER,
    "externalRef" TEXT,
    "dedupHash" TEXT NOT NULL,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNRECONCILED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_officeId_idx" ON "BankAccount"("officeId");

-- CreateIndex
CREATE INDEX "BankAccount_clientId_idx" ON "BankAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_officeId_clientId_iban_key" ON "BankAccount"("officeId", "clientId", "iban");

-- CreateIndex
CREATE INDEX "BankStatementImport_officeId_idx" ON "BankStatementImport"("officeId");

-- CreateIndex
CREATE INDEX "BankStatementImport_bankAccountId_fileHash_idx" ON "BankStatementImport"("bankAccountId", "fileHash");

-- CreateIndex
CREATE INDEX "BankTransaction_officeId_status_idx" ON "BankTransaction"("officeId", "status");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_bookingDate_idx" ON "BankTransaction"("bankAccountId", "bookingDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_officeId_dedupHash_key" ON "BankTransaction"("officeId", "dedupHash");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

