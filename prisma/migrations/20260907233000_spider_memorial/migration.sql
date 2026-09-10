-- AlterTable
ALTER TABLE "Spider" ADD COLUMN IF NOT EXISTS "memorializedAt" TIMESTAMP(3);
ALTER TABLE "Spider" ADD COLUMN IF NOT EXISTS "passedOn" TIMESTAMP(3);
ALTER TABLE "Spider" ADD COLUMN IF NOT EXISTS "memorialNote" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Spider_userId_memorializedAt_idx" ON "Spider"("userId", "memorializedAt");
