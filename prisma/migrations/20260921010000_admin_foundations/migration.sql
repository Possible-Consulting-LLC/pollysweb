-- Additive security foundations. No owner is selected or assigned by migration.
BEGIN;
ALTER TABLE "User"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "deletingAt" TIMESTAMP(3),
  ADD COLUMN "adminVersion" UUID,
  ADD COLUMN "accountVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('user', 'admin', 'super_admin')),
  ADD CONSTRAINT "User_privileged_demo_check" CHECK (NOT "isDemo" OR "role" = 'user'),
  ADD CONSTRAINT "User_privileged_verified_check" CHECK ("role" = 'user' OR "emailVerified" IS NOT NULL);

CREATE TABLE "ProtectedOwner" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProtectedOwner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProtectedOwner_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "ProtectedOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "ProtectedOwner_userId_key" ON "ProtectedOwner"("userId");
ALTER TABLE "ProtectedOwner" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProtectedOwner" FROM PUBLIC, anon, authenticated;

-- All ordinary SQL, including INSERT/TRUNCATE, is denied. Controlled bootstrap
-- requires infrastructure-level trigger disablement in an explicitly reviewed
-- transaction, as documented in docs/security/admin-owner-bootstrap.md.
CREATE FUNCTION protect_owner_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Protected owner binding requires controlled infrastructure bootstrap';
END;
$$;
CREATE TRIGGER "ProtectedOwner_immutable"
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "ProtectedOwner"
FOR EACH STATEMENT EXECUTE FUNCTION protect_owner_binding();

CREATE FUNCTION protect_admin_user() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."ProtectedOwner" WHERE "userId" = OLD."id") THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Protected owner cannot be deleted';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."role" <> 'super_admin'
       OR NEW."suspendedAt" IS NOT NULL OR NEW."deletingAt" IS NOT NULL
       OR NEW."isDemo" OR NEW."emailVerified" IS NULL THEN
      RAISE EXCEPTION 'Protected owner cannot be demoted, suspended, deleted or made demo';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."role" IS DISTINCT FROM OLD."role"
     OR NEW."suspendedAt" IS DISTINCT FROM OLD."suspendedAt"
     OR NEW."deletingAt" IS DISTINCT FROM OLD."deletingAt"
     OR NEW."isDemo" IS DISTINCT FROM OLD."isDemo" THEN
    NEW."adminVersion" := gen_random_uuid();
  END IF;
  IF (NEW."name" IS DISTINCT FROM OLD."name"
      OR NEW."timezone" IS DISTINCT FROM OLD."timezone"
      OR NEW."dateFormat" IS DISTINCT FROM OLD."dateFormat"
      OR NEW."measurement" IS DISTINCT FROM OLD."measurement"
      OR NEW."theme" IS DISTINCT FROM OLD."theme"
      OR NEW."feedDefaultDays" IS DISTINCT FROM OLD."feedDefaultDays"
      OR NEW."mistDefaultDays" IS DISTINCT FROM OLD."mistDefaultDays"
      OR NEW."cleanDefaultDays" IS DISTINCT FROM OLD."cleanDefaultDays"
      OR NEW."image" IS DISTINCT FROM OLD."image"
      OR NEW."stripeCustomerId" IS DISTINCT FROM OLD."stripeCustomerId"
      OR NEW."stripeSubscriptionId" IS DISTINCT FROM OLD."stripeSubscriptionId"
      OR NEW."email" IS DISTINCT FROM OLD."email"
      OR NEW."role" IS DISTINCT FROM OLD."role"
      OR NEW."suspendedAt" IS DISTINCT FROM OLD."suspendedAt"
      OR NEW."deletingAt" IS DISTINCT FROM OLD."deletingAt"
      OR NEW."isDemo" IS DISTINCT FROM OLD."isDemo")
     AND NEW."accountVersion" = OLD."accountVersion" THEN
    NEW."accountVersion" := OLD."accountVersion" + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_admin_protection"
BEFORE UPDATE OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION protect_admin_user();
ALTER TABLE "PendingEmailVerification" ADD COLUMN "requestedByAdminId" TEXT;
CREATE TABLE "AdminAudit" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "targetId" TEXT,
  "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAudit_createdAt_id_idx" ON "AdminAudit"("createdAt", "id");
CREATE INDEX "AdminAudit_actorId_createdAt_idx" ON "AdminAudit"("actorId", "createdAt");
CREATE INDEX "AdminAudit_targetId_createdAt_idx" ON "AdminAudit"("targetId", "createdAt");
CREATE INDEX "AdminAudit_action_createdAt_idx" ON "AdminAudit"("action", "createdAt");
ALTER TABLE "AdminAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminAudit" FROM PUBLIC, anon, authenticated;
CREATE FUNCTION prevent_admin_audit_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $audit$
BEGIN RAISE EXCEPTION 'Administrative audit events cannot be edited'; END;
$audit$;
CREATE TRIGGER "AdminAudit_no_update" BEFORE UPDATE ON "AdminAudit"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_update();
CREATE TABLE "AdminReauth" (
  "tokenHash" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "credentialVersion" TEXT NOT NULL,
  "provider" TEXT, "providerAccountId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "verifiedAt" TIMESTAMP(3)
);
CREATE INDEX "AdminReauth_expiresAt_idx" ON "AdminReauth"("expiresAt");
CREATE INDEX "AdminReauth_actorId_idx" ON "AdminReauth"("actorId");
ALTER TABLE "AdminReauth" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdminReauth" FROM PUBLIC, anon, authenticated;
-- Resumable deletion receipts and upload admission ledger (no cascading references).
CREATE TABLE "AccountDeletionOperation" (
 "id" TEXT PRIMARY KEY, "targetId" TEXT NOT NULL UNIQUE, "targetRole" TEXT NOT NULL,
 "stage" TEXT NOT NULL DEFAULT 'blocked_access' CHECK ("stage" IN ('blocked_access','billing_canceled','photos_removed','completed')),
 "manifest" JSONB NOT NULL, "customerId" TEXT, "subscriptionId" TEXT,
 "spiderCount" INTEGER NOT NULL, "eventCount" INTEGER NOT NULL, "photoCount" INTEGER NOT NULL,
 "subscriptionPresent" BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3)
);
CREATE TABLE "OwnedUpload" ("key" TEXT PRIMARY KEY, "settled" BOOLEAN NOT NULL DEFAULT false, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "OwnedUpload_userId_idx" ON "OwnedUpload"("userId");
ALTER TABLE "AccountDeletionOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnedUpload" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AccountDeletionOperation", "OwnedUpload" FROM PUBLIC, anon, authenticated;

-- Lock the account before accepting any owned record write. This also versions
-- impact previews for care/photo changes. Conflicting legacy child-first locks
-- may be deadlock-aborted by PostgreSQL, but cannot cross the deletion boundary.
CREATE FUNCTION block_deleting_owned_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $deleting_write$
DECLARE owner_id TEXT; blocked TIMESTAMP(3); payload JSONB;
BEGIN
 payload := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME IN ('Spider','Reminder','CareDay','CareCheckin','CelebratedReward','Account','OwnedUpload','PendingEmailVerification') THEN
  owner_id := payload->>'userId';
 ELSIF TG_TABLE_NAME = 'EnclosureMaintenanceEvent' THEN
  SELECT s."userId" INTO owner_id FROM "Enclosure" e JOIN "Spider" s ON s."id"=e."spiderId" WHERE e."id"=payload->>'enclosureId';
 ELSE
  SELECT "userId" INTO owner_id FROM "Spider" WHERE "id"=payload->>'spiderId';
 END IF;
 IF owner_id IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF current_setting('app.account_deletion_target', true) = owner_id THEN
  IF TG_OP = 'DELETE' OR (TG_TABLE_NAME = 'OwnedUpload' AND TG_OP = 'UPDATE' AND payload->>'userId' = to_jsonb(OLD)->>'userId' AND payload->>'key' = to_jsonb(OLD)->>'key') THEN
   IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
 END IF;
 SELECT "deletingAt" INTO blocked FROM "User" WHERE "id"=owner_id FOR UPDATE;
 IF NOT FOUND OR blocked IS NOT NULL THEN RAISE EXCEPTION 'Account is unavailable for writes'; END IF;
 UPDATE "User" SET "accountVersion"="accountVersion"+1 WHERE "id"=owner_id;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $deleting_write$;
DO $owned_write_triggers$ DECLARE table_name TEXT; BEGIN
 FOREACH table_name IN ARRAY ARRAY['Spider','Reminder','CareDay','CareCheckin','CelebratedReward','Account','OwnedUpload','PendingEmailVerification','Enclosure','FeedingEvent','MistingEvent','MoltEvent','ObservationEvent','BodyConditionEvent','EnclosureMaintenanceEvent','Photo'] LOOP
  EXECUTE format('CREATE TRIGGER block_deleting_write BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION block_deleting_owned_write()', table_name);
 END LOOP;
END; $owned_write_triggers$;
CREATE FUNCTION block_deleting_user_update() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $deleting_user_update$
BEGIN
 IF OLD."deletingAt" IS NOT NULL THEN RAISE EXCEPTION 'Account is unavailable for writes'; END IF;
 RETURN NEW;
END; $deleting_user_update$;
CREATE TRIGGER block_deleting_user_update BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION block_deleting_user_update();

CREATE FUNCTION block_unconfirmed_user_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $confirmed_user_delete$
BEGIN
 IF current_setting('app.account_deletion_target', true) IS DISTINCT FROM OLD."id" OR
    NOT EXISTS (SELECT 1 FROM "AccountDeletionOperation" WHERE "targetId"=OLD."id" AND "stage"='photos_removed') THEN
  RAISE EXCEPTION 'Account deletion requires completed billing and storage cleanup';
 END IF;
 RETURN OLD;
END; $confirmed_user_delete$;
CREATE TRIGGER block_unconfirmed_user_delete BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION block_unconfirmed_user_delete();

-- Demo entitlements are independent of all real billing columns.
ALTER TABLE "User" ADD COLUMN "demoPlan" TEXT, ADD COLUMN "demoLabel" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_demo_designation_check" CHECK (
  ("isDemo" AND "role" = 'user' AND "demoPlan" IN ('free','pro') AND "demoPlan" IS NOT NULL
    AND "demoLabel" IS NOT NULL AND "demoLabel" ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$')
  OR (NOT "isDemo" AND "demoPlan" IS NULL AND "demoLabel" IS NULL)
);
CREATE TABLE "BillingCheckoutIntent" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT,
  "interval" TEXT NOT NULL CHECK ("interval" IN ('monthly','yearly')),
  "priceId" TEXT NOT NULL, "appUrl" TEXT NOT NULL, "customerId" TEXT,
  "phase" TEXT NOT NULL DEFAULT 'prepare' CHECK ("phase" IN ('prepare','session')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("phase" <> 'session' OR "customerId" IS NOT NULL)
);
CREATE INDEX "BillingCheckoutIntent_createdAt_id_idx" ON "BillingCheckoutIntent"("createdAt", "id");
ALTER TABLE "BillingCheckoutIntent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "BillingCheckoutIntent" FROM PUBLIC, anon, authenticated;
CREATE FUNCTION guard_checkout_intent() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $checkout_intent$
DECLARE account_row public."User";
BEGIN
  SELECT * INTO account_row FROM public."User" WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."userId" ELSE NEW."userId" END FOR UPDATE;
  IF NOT FOUND OR account_row."isDemo" OR account_row."deletingAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Account cannot have an unresolved checkout';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW."id", NEW."userId", NEW."interval", NEW."priceId", NEW."appUrl", NEW."createdAt") IS DISTINCT FROM
       (OLD."id", OLD."userId", OLD."interval", OLD."priceId", OLD."appUrl", OLD."createdAt")
       OR (OLD."customerId" IS NOT NULL AND NEW."customerId" IS DISTINCT FROM OLD."customerId")
       OR (OLD."phase" = 'session' AND NEW."phase" <> 'session') THEN
      RAISE EXCEPTION 'Checkout retry identity is immutable';
    END IF;
  END IF;
  UPDATE public."User" SET "accountVersion" = "accountVersion" + 1 WHERE "id" = account_row."id";
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $checkout_intent$;
CREATE TRIGGER "BillingCheckoutIntent_guard" BEFORE INSERT OR UPDATE OR DELETE ON "BillingCheckoutIntent"
FOR EACH ROW EXECUTE FUNCTION guard_checkout_intent();
CREATE FUNCTION guard_demo_checkout_boundary() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $demo_checkout_boundary$
BEGIN
  IF (NEW."isDemo" OR NEW."deletingAt" IS NOT NULL) AND
    EXISTS (SELECT 1 FROM public."BillingCheckoutIntent" WHERE "userId" = NEW."id") THEN
    RAISE EXCEPTION 'Recover unresolved checkout before designation or deletion';
  END IF;
  IF NEW."demoPlan" IS DISTINCT FROM OLD."demoPlan" OR NEW."demoLabel" IS DISTINCT FROM OLD."demoLabel" THEN
    IF NEW."accountVersion" = OLD."accountVersion" THEN NEW."accountVersion" := OLD."accountVersion" + 1; END IF;
  END IF;
  RETURN NEW;
END; $demo_checkout_boundary$;
CREATE TRIGGER "User_demo_checkout_boundary" BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION guard_demo_checkout_boundary();


ALTER TABLE "User" ADD COLUMN "testContextVersion" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE "AdminTestSession" (
 "id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "actorId" TEXT NOT NULL,
 "targetId" TEXT NOT NULL, "credentialVersion" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "endedAt" TIMESTAMP(3),
 CONSTRAINT "AdminTestSession_lifetime" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '60 minutes')
);
CREATE INDEX "AdminTestSession_actorId_idx" ON "AdminTestSession"("actorId");
CREATE INDEX "AdminTestSession_targetId_idx" ON "AdminTestSession"("targetId");
CREATE INDEX "AdminTestSession_expiresAt_idx" ON "AdminTestSession"("expiresAt");
CREATE UNIQUE INDEX "AdminTestSession_one_active_actor" ON "AdminTestSession"("actorId") WHERE "endedAt" IS NULL;
ALTER TABLE "AdminTestSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AdminTestSession" FROM PUBLIC;
DO $test_session_privileges$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "AdminTestSession" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "AdminTestSession" FROM authenticated; END IF;
END $test_session_privileges$;

CREATE TABLE "SiteSettings" (
 "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
 "deadline" TIMESTAMP(3), "announcementEnabled" BOOLEAN NOT NULL DEFAULT false,
 "announcement" TEXT NOT NULL DEFAULT '' CHECK (length("announcement") <= 500),
 "updatedBy" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "SiteSettings" ("id") VALUES (1);
ALTER TABLE "SiteSettings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SiteSettings" FROM PUBLIC;
DO $maintenance_privileges$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON "SiteSettings" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON "SiteSettings" FROM authenticated; END IF;
END $maintenance_privileges$;

COMMIT;
