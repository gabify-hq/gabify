-- CreateIndex
CREATE UNIQUE INDEX "EmailAttachment_inboundEmailId_providerAttachmentId_key" ON "EmailAttachment"("inboundEmailId", "providerAttachmentId");
