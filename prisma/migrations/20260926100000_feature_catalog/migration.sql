-- Additive feature catalog for the plan-creator slice; no existing tables or rows change.
-- Rows are created by src/lib/admin/feature-sync.ts from the code registry, inactive by default.
CREATE TABLE "Feature" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");
ALTER TABLE "Feature" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "Feature" FROM PUBLIC, anon, authenticated;
