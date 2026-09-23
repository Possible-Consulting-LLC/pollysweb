CREATE TABLE "PendingEmailVerification" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "userId" TEXT,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingEmailVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PendingEmailVerification_tokenHash_key" ON "PendingEmailVerification"("tokenHash");
CREATE INDEX "PendingEmailVerification_email_purpose_idx" ON "PendingEmailVerification"("email", "purpose");
CREATE INDEX "PendingEmailVerification_expiresAt_idx" ON "PendingEmailVerification"("expiresAt");
