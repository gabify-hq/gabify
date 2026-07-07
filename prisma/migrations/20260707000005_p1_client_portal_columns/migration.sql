-- Fase P1 — portal do cliente final: clientId em User e Invitation.
-- Invariant (defesa em profundidade sobre a validação aplicacional):
-- role CLIENT ⇔ clientId preenchido, em ambas as tabelas.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "clientId" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE INDEX "Invitation_clientId_idx" ON "Invitation"("clientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints: role CLIENT requires clientId, any other role forbids it
ALTER TABLE "User" ADD CONSTRAINT "User_client_role_check"
  CHECK ((role = 'CLIENT') = ("clientId" IS NOT NULL));

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_client_role_check"
  CHECK ((role = 'CLIENT') = ("clientId" IS NOT NULL));
