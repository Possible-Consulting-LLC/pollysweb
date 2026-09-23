-- Additive migration. Review the exact staging target before any execution.
CREATE TABLE "CareDay" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "CareDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareDay_userId_dayKey_key" ON "CareDay"("userId", "dayKey");
CREATE INDEX "CareDay_userId_completedAt_idx" ON "CareDay"("userId", "completedAt");

ALTER TABLE "CareDay" ADD CONSTRAINT "CareDay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only table; the browser Data API has no policy or grant.
ALTER TABLE "CareDay" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CareDay" FROM PUBLIC, anon, authenticated;
