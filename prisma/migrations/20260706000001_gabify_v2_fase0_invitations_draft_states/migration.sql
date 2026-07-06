-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionStatus" ADD VALUE 'APPROVED_SENT';
ALTER TYPE "ActionStatus" ADD VALUE 'APPROVED_SEND_FAILED';

-- AlterTable
ALTER TABLE "EmailAction" ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sendError" TEXT;

-- AlterTable
ALTER TABLE "EmailReview" ADD COLUMN     "editedBody" TEXT;

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_officeId_email_idx" ON "Invitation"("officeId", "email");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- Dedupe before adding the unique constraint: the draft-race bug (achado #10) may
-- have created duplicate actions. Keep the earliest per (inboundEmailId, type).
DELETE FROM "EmailAction" a
USING "EmailAction" b
WHERE a."inboundEmailId" = b."inboundEmailId"
  AND a."type" = b."type"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "EmailAction_inboundEmailId_type_key" ON "EmailAction"("inboundEmailId", "type");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
