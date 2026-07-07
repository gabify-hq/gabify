-- CreateEnum
CREATE TYPE "ToconlineConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ToconlinePushStatus" AS ENUM ('PENDING', 'SENT', 'ERROR');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "toconlineDocumentId" TEXT,
ADD COLUMN     "toconlinePushError" TEXT,
ADD COLUMN     "toconlinePushStatus" "ToconlinePushStatus",
ADD COLUMN     "toconlinePushedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ToconlineConnection" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "oauthUrl" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "oauthClientSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "ToconlineConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToconlineConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToconlineEntityMap" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "toconlineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToconlineEntityMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToconlinePushPreview" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToconlinePushPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToconlineConnection_clientId_key" ON "ToconlineConnection"("clientId");

-- CreateIndex
CREATE INDEX "ToconlineConnection_officeId_idx" ON "ToconlineConnection"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "ToconlineEntityMap_connectionId_entityType_nif_key" ON "ToconlineEntityMap"("connectionId", "entityType", "nif");

-- CreateIndex
CREATE INDEX "ToconlinePushPreview_connectionId_createdAt_idx" ON "ToconlinePushPreview"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "ToconlinePushPreview_documentId_idx" ON "ToconlinePushPreview"("documentId");

-- CreateIndex
CREATE INDEX "Document_officeId_toconlinePushStatus_idx" ON "Document"("officeId", "toconlinePushStatus");

-- AddForeignKey
ALTER TABLE "ToconlineConnection" ADD CONSTRAINT "ToconlineConnection_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToconlineConnection" ADD CONSTRAINT "ToconlineConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToconlineEntityMap" ADD CONSTRAINT "ToconlineEntityMap_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ToconlineConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToconlinePushPreview" ADD CONSTRAINT "ToconlinePushPreview_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ToconlineConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToconlinePushPreview" ADD CONSTRAINT "ToconlinePushPreview_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
