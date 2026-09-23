ALTER TABLE "User" ADD COLUMN "emailChangeVersion" UUID;
ALTER TABLE "PendingEmailVerification" ADD COLUMN "previousEmail" TEXT;
