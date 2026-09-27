-- Additive per-plan feature assignment for the plan-creator slice; no existing
-- tables or rows change. The pair (planId, featureId) is unique; missing rows
-- resolve as disabled. Matrix saves upsert enabled values and never delete
-- rows, so release state can be restored safely.
CREATE TABLE "FeaturePlanTranslation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "featureId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "FeaturePlanTranslation_planId_featureId_key" ON "FeaturePlanTranslation"("planId", "featureId");
CREATE INDEX "FeaturePlanTranslation_featureId_idx" ON "FeaturePlanTranslation"("featureId");
ALTER TABLE "FeaturePlanTranslation" ADD CONSTRAINT "FeaturePlanTranslation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturePlanTranslation" ADD CONSTRAINT "FeaturePlanTranslation_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeaturePlanTranslation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FeaturePlanTranslation" FROM PUBLIC, anon, authenticated;
