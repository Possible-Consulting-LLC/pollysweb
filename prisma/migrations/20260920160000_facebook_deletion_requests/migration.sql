-- Additive request ledger only; no existing account or care data is changed.
CREATE TABLE "FacebookDeletionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestHash" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "confirmationCode" TEXT NOT NULL,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FacebookDeletionRequest_status_check" CHECK ("status" IN ('pending_review', 'needs_sign_in_method', 'completed'))
);
CREATE UNIQUE INDEX "FacebookDeletionRequest_requestHash_key" ON "FacebookDeletionRequest"("requestHash");
CREATE UNIQUE INDEX "FacebookDeletionRequest_confirmationCode_key" ON "FacebookDeletionRequest"("confirmationCode");
CREATE INDEX "FacebookDeletionRequest_subjectHash_idx" ON "FacebookDeletionRequest"("subjectHash");
CREATE INDEX "FacebookDeletionRequest_status_createdAt_idx" ON "FacebookDeletionRequest"("status", "createdAt");
ALTER TABLE "FacebookDeletionRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FacebookDeletionRequest" FROM PUBLIC, anon, authenticated;
