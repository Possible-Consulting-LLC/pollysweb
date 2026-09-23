ALTER TABLE "User"
  ADD COLUMN "billingLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "billingNextCheckAt" TIMESTAMP(3),
  ADD COLUMN "billingCheckFailures" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "User_billingNextCheckAt_id_idx" ON "User"("billingNextCheckAt", "id");

UPDATE "User"
SET "billingNextCheckAt" = NOW()
WHERE "stripeCustomerId" IS NOT NULL;
