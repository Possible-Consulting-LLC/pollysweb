-- Preserve completion snapshots so a later correction can restore withdrawn care days.
ALTER TABLE "CareDay" ADD COLUMN "invalidatedAt" TIMESTAMP(3);
