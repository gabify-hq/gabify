-- TOConline pull slice + "Ligações" skeleton

-- Document: final customer name for pulled issued invoices
ALTER TABLE "Document" ADD COLUMN "buyerName" TEXT;

-- ToconlineConnection: capability toggles + pull state
ALTER TABLE "ToconlineConnection"
  ADD COLUMN "pullEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastPullAt" TIMESTAMP(3),
  ADD COLUMN "lastPullCursor" TEXT;

-- Ligações model: a client may hold N source connections but at most ONE
-- push-enabled destination. Replace the global clientId unique with a plain
-- index + a partial unique index (Prisma schema cannot express partials).
DROP INDEX "ToconlineConnection_clientId_key";
CREATE INDEX "ToconlineConnection_clientId_idx" ON "ToconlineConnection"("clientId");
CREATE UNIQUE INDEX "ToconlineConnection_push_destination_unique"
  ON "ToconlineConnection"("clientId") WHERE "pushEnabled";

-- ToconlineEntityMap: nif → externalKey (data-preserving rename; the column
-- now also carries TOConline sales-document ids for pull dedup)
ALTER TABLE "ToconlineEntityMap" RENAME COLUMN "nif" TO "externalKey";
ALTER INDEX "ToconlineEntityMap_connectionId_entityType_nif_key"
  RENAME TO "ToconlineEntityMap_connectionId_entityType_externalKey_key";

-- ToconlinePushPreview: dry-run PULL previews describe a Document that would
-- be created — it does not exist yet, so the FK becomes nullable
ALTER TABLE "ToconlinePushPreview" ALTER COLUMN "documentId" DROP NOT NULL;
