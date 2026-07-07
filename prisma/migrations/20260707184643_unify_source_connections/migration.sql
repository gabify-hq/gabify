-- CreateEnum
CREATE TYPE "SourceConnectionStatus" AS ENUM ('ATIVA', 'ERRO', 'DESLIGADA');

-- CreateEnum
CREATE TYPE "SourceSystem" AS ENUM ('MOLONI', 'INVOICEXPRESS');

-- CreateTable
CREATE TABLE "MoloniConnection" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "pullEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastPullAt" TIMESTAMP(3),
    "status" "SourceConnectionStatus" NOT NULL DEFAULT 'ATIVA',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MoloniConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicexpressConnection" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "pullEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastPullAt" TIMESTAMP(3),
    "status" "SourceConnectionStatus" NOT NULL DEFAULT 'ATIVA',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InvoicexpressConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceEntityMap" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "system" "SourceSystem" NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'SALES_DOCUMENT',
    "externalId" TEXT NOT NULL,
    "documentId" TEXT,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceEntityMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoloniConnection_officeId_idx" ON "MoloniConnection"("officeId");

-- CreateIndex
CREATE INDEX "MoloniConnection_clientId_idx" ON "MoloniConnection"("clientId");

-- CreateIndex
CREATE INDEX "InvoicexpressConnection_officeId_idx" ON "InvoicexpressConnection"("officeId");

-- CreateIndex
CREATE INDEX "InvoicexpressConnection_clientId_idx" ON "InvoicexpressConnection"("clientId");

-- CreateIndex
CREATE INDEX "SourceEntityMap_officeId_idx" ON "SourceEntityMap"("officeId");

-- CreateIndex
CREATE INDEX "SourceEntityMap_clientId_idx" ON "SourceEntityMap"("clientId");

-- CreateIndex
CREATE INDEX "SourceEntityMap_documentId_idx" ON "SourceEntityMap"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceEntityMap_system_entityType_externalId_clientId_key" ON "SourceEntityMap"("system", "entityType", "externalId", "clientId");

-- AddForeignKey
ALTER TABLE "MoloniConnection" ADD CONSTRAINT "MoloniConnection_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoloniConnection" ADD CONSTRAINT "MoloniConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicexpressConnection" ADD CONSTRAINT "InvoicexpressConnection_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicexpressConnection" ADD CONSTRAINT "InvoicexpressConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEntityMap" ADD CONSTRAINT "SourceEntityMap_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEntityMap" ADD CONSTRAINT "SourceEntityMap_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEntityMap" ADD CONSTRAINT "SourceEntityMap_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
