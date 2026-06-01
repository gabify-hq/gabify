-- AddColumn
ALTER TABLE "public"."EmailAccount" ADD COLUMN IF NOT EXISTS "outlookSubscriptionId" TEXT;
ALTER TABLE "public"."EmailAccount" ADD COLUMN IF NOT EXISTS "gmailWatchExpiry" TIMESTAMP(3);
