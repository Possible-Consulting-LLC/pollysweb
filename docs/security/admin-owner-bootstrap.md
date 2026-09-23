# Protected administrator owner bootstrap

## Current status

Staging completed this reviewed procedure on September 23, 2026 after explicit approval. The protected owner is immutable account ID `cmu2th6ml0000i904zjrje3gl` (`rebecca@rebecca79.com`). Read-only verification confirmed the exact binding, verified/active/non-demo `super_admin`, exactly one privileged account, rotated admin session version and enabled owner/user guard triggers. The same ID is configured locally and as a Production Secret on the separate `spoodly-space-staging` Vercel project; application deployment remains a separate pending step. Production has not been accessed and requires its own approval and identity verification.

`ADMIN_OWNER_ID` is a server-only, environment-specific immutable account ID. Never expose it as a `NEXT_PUBLIC_` value or infer it from email supplied by a browser, signup time, row order or a guessed ID. Setting it does **not** bootstrap an owner, assign a role or change the `ProtectedOwner` table. Every admin request compares this value with the singleton binding and validates its live owner row. A missing/mismatched binding or unavailable database denies admin access. Ordinary user login/session resolution does not depend on this configuration.

## Approval and verification

1. Verify the environment/project independently, including its staging or production identity. Do not run seed/reset commands.
2. Have the owner identify their account through the existing authenticated account workflow, and independently verify the exact database account ID and verified email. Confirm the account is active, not deleting and not a demo account. The administrator dashboard must not offer an owner selector or binding editor.
3. Review and obtain explicit approval for the additive migration and this one-time bootstrap using the verified ID. Use infrastructure credentials; do not add a bootstrap API route or application action.
4. Apply the approved migration separately. It creates an **empty** binding and defaults all existing roles to `user`; it never chooses an owner.
5. In the approved environment, run one reviewed transaction below with the independently verified immutable ID substituted for the placeholder. It fails if *any* binding exists, the account is absent or ineligible, or other privileged accounts already exist at initial activation. Do not catch those failures and proceed. The statement-level guard is disabled only while the infrastructure transaction holds exclusive table access. Rollback also restores trigger state.

## Reviewed operator SQL template — not executed

```sql
BEGIN;
-- Match runtime's user-first lock order. Block concurrent user writes while the
-- one-time role/binding invariant is established.
LOCK TABLE public."User" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."ProtectedOwner" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  verified_owner_id TEXT := '<INDEPENDENTLY_VERIFIED_IMMUTABLE_ACCOUNT_ID>';
BEGIN
  IF EXISTS (SELECT 1 FROM public."ProtectedOwner") THEN
    RAISE EXCEPTION 'Owner binding already exists; bootstrap cannot replace it';
  END IF;
  IF EXISTS (SELECT 1 FROM public."User" WHERE "role" <> 'user') THEN
    RAISE EXCEPTION 'Review existing privileged accounts before initial bootstrap';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."User"
    WHERE "id" = verified_owner_id AND "emailVerified" IS NOT NULL
      AND "suspendedAt" IS NULL AND "deletingAt" IS NULL AND NOT "isDemo"
  ) THEN
    RAISE EXCEPTION 'Verified owner is missing or ineligible';
  END IF;
  UPDATE public."User" SET "role" = 'super_admin', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = verified_owner_id;
  -- Only infrastructure operations may disable this guard. Runtime app code
  -- must never perform DDL or run this procedure.
  ALTER TABLE public."ProtectedOwner" DISABLE TRIGGER "ProtectedOwner_immutable";
  INSERT INTO public."ProtectedOwner" ("id", "userId") VALUES (1, verified_owner_id);
  ALTER TABLE public."ProtectedOwner" ENABLE TRIGGER "ProtectedOwner_immutable";
END;
$$;
COMMIT;
```

6. Set server-only `ADMIN_OWNER_ID` to that same verified ID. The owner signs in again because the role change rotates `adminVersion`. Verify the binding, owner role and enabled guard with infrastructure read access. Verify admin access succeeds only for that account initially, and a deliberately mismatched/missing configured ID denies all admin entry. Changing configuration must leave the database binding unchanged.
7. Later delegated role changes must use the reviewed administration services. Do not reuse this procedure to replace ownership. Ownership transfer/recovery is an infrastructure incident/change with its own separately reviewed procedure.

## Invariants and deployment checks

- `ProtectedOwner` permits exactly the singleton key `1` and references an existing account with restrictive delete/update behavior. Its guard rejects ordinary INSERT, UPDATE, DELETE and TRUNCATE, including attempted replacement of an existing binding.
- The user trigger rejects owner deletion, ID change, suspension, deletion-in-progress, demotion, demo designation and removal of verified status. Demo accounts cannot be privileged; privileged accounts must have verified email.
- Any change to role, suspension, deletion-in-progress or demo designation rotates nullable `adminVersion`. The existing credential HMAC incorporates it for password and social accounts. Null preserves untouched pre-rollout sessions; changes invalidate prior sessions and outstanding credential-bound email changes.
- Browser Data API roles have no table grants or RLS policies for the owner binding. Production/staging application database roles should not receive infrastructure DDL powers. Database infrastructure owners necessarily retain the ability to disable/drop guards; this is outside normal app operations.
- Privileged mutations use `withAdminMutation`: acquire unique actor/target account locks in lexical ID order, reload both current rows, recheck session credentials and policy, and perform changes in the same transaction. Later mutation services must use this helper and enforce their own recent reauthentication, origin checks, validation and audit requirements.
- Recent authentication is implemented through credential-bound `AdminReauth` proofs with a five-minute lifetime. Password proof validates the actor's own password; social proof must return through the linked provider identity with the dedicated challenge. An ordinary login, email-change timestamp, or browser claim is not an admin proof.

The SQL was statically reviewed, not executed or integration-tested. The **actual bound staging owner is read-only during acceptance**: inspect binding, role, eligibility and guard state; never attempt deletion, suspension, demotion, binding replacement or rollback-based destructive probes against that account. Destructive owner invariants use injected disposable repository tests. Any later PostgreSQL trigger execution for owner mutations/binding insert, replacement or truncate requires a separately reviewed isolated disposable database with a disposable owner, never the actual staging binding. TypeScript and lexical SQL tests cannot prove PostgreSQL behavior.

At the separately approved staging checkpoint, validate ordinary disposable-account constraints, credential rotation and actor/target races. Confirm the runtime database role can SELECT the binding needed by authorization and triggers, and inspect actual table grants/default privileges. RLS and explicit PUBLIC/anon/authenticated revocations are authored for every new private table; their effective deployed permissions are still unverified. No production database access is part of this procedure's current authorization.
