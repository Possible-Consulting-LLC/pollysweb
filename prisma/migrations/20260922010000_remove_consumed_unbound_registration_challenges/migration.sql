-- Intentionally destructive legacy authentication-metadata cleanup.
-- Requires explicit database approval separately from additive admin foundations.
-- Preserve pending/unconsumed challenges, bound challenges and all app/care data.
BEGIN;

DELETE FROM "PendingEmailVerification"
WHERE "purpose" = 'register'
  AND "consumedAt" IS NOT NULL
  AND "userId" IS NULL;

COMMIT;
