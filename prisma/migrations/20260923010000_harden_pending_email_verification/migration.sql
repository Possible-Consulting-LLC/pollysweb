-- Additive security hardening only. No challenge records are changed or removed.
ALTER TABLE "PendingEmailVerification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PendingEmailVerification" FROM PUBLIC, anon, authenticated;
