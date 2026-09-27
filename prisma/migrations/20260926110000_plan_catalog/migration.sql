-- Additive plan catalog for the plan-creator slice; no existing tables or rows change.
-- Plan names are display labels (identity is the id); at most one active billing
-- option per (planId, interval) is enforced at the service layer, not by an index.
CREATE TABLE "Plan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "planType" TEXT NOT NULL,
  "maxSpiders" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "public" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PlanBillingOption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Plan_sortOrder_name_idx" ON "Plan"("sortOrder", "name");
CREATE INDEX "PlanBillingOption_planId_interval_idx" ON "PlanBillingOption"("planId", "interval");
CREATE INDEX "PlanBillingOption_planId_active_idx" ON "PlanBillingOption"("planId", "active");
ALTER TABLE "PlanBillingOption" ADD CONSTRAINT "PlanBillingOption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanBillingOption" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Plan" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "PlanBillingOption" FROM PUBLIC, anon, authenticated;
