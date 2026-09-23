-- Additive only: preserve every existing care record and earned care day.
CREATE TABLE "CareCheckin" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "spiderId" TEXT NOT NULL REFERENCES "Spider"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dayKey" TEXT NOT NULL,
  "deferred" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY ("userId", "dayKey", "spiderId")
);
CREATE TABLE "CelebratedReward" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "key")
);
ALTER TABLE "CareCheckin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CelebratedReward" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CareCheckin", "CelebratedReward" FROM PUBLIC, anon, authenticated;
