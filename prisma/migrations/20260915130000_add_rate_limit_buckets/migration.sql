-- Additive migration. Apply only after reviewing and approving the target database.
CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
-- Counters are server-only. No public Data API policies or grants.
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RateLimitBucket" FROM PUBLIC, anon, authenticated;
