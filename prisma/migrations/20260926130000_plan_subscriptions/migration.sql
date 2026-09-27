-- UserSubscription: admin-assigned plan subscriptions. One row per assignment;
-- at most one row per user is effective (status TRIALING/ACTIVE/PAST_DUE and
-- expiresAt null or in the future). discountId is intentionally a plain nullable
-- scalar: the Discount entities are a later phase and add the relation + FK.
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planBillingOptionId" TEXT NOT NULL,
    "discountId" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "renewsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSubscription_userId_status_expiresAt_idx" ON "UserSubscription"("userId", "status", "expiresAt");
CREATE INDEX "UserSubscription_planId_status_expiresAt_idx" ON "UserSubscription"("planId", "status", "expiresAt");

DO $$ BEGIN
    ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planBillingOptionId_fkey"
      FOREIGN KEY ("planBillingOptionId") REFERENCES "PlanBillingOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
END $$;
