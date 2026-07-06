-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "outlookSubscriptionExpiry" TIMESTAMP(3);

-- EmailThread gains a mandatory office scope (achado #16 / AC-1.4.d).
-- Backfill from the office of the first email in each thread; orphan threads
-- (no emails) carry no information and are removed.
ALTER TABLE "EmailThread" ADD COLUMN "officeId" TEXT;

UPDATE "EmailThread" t
SET "officeId" = sub."officeId"
FROM (
  SELECT DISTINCT ON (ie."threadId") ie."threadId", ea."officeId"
  FROM "InboundEmail" ie
  JOIN "EmailAccount" ea ON ea."id" = ie."emailAccountId"
  WHERE ie."threadId" IS NOT NULL
  ORDER BY ie."threadId", ie."createdAt" ASC
) sub
WHERE t."id" = sub."threadId";

DELETE FROM "EmailThread" WHERE "officeId" IS NULL;

ALTER TABLE "EmailThread" ALTER COLUMN "officeId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "EmailThread_officeId_providerThreadId_idx" ON "EmailThread"("officeId", "providerThreadId");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE;
