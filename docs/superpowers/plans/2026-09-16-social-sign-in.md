# Social Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google, Apple, and Facebook account creation/sign-in and explicit linking to existing keeper accounts.

**Architecture:** Keep Auth.js JWT sessions and existing keeper IDs. Add the Auth.js Prisma adapter and provider `Account` rows; allow a nullable password hash for provider-only keepers. Never merge accounts by email without a signed-in session. Enable provider buttons only when their staging credentials are configured.

**Tech Stack:** Next.js 16, Auth.js/NextAuth 5, Prisma 6, PostgreSQL on the isolated staging Supabase project, React 19, node:test.

**Spec:** `docs/superpowers/specs/2026-09-16-social-sign-in-design.md`

## Global Constraints

- Work only in `/Users/rebeccapossible/web/spoodly-space/.worktrees/staging` on `codex/staging-setup`; do not commit or push to `main`.
- Never access the production database or run seed commands. Any migration execution must pass the existing staging identity guard for Supabase project `nfdecdylxcmuypxodppe`.
- Do not touch the production Vercel project. Staging Vercel project ID is `prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`.
- Preserve legacy password hashes, password login, keeper IDs, billing ownership, and password-change session invalidation.
- Instagram, automatic same-email linking, social data access, and provider-only password creation are excluded.
- Write failing tests before behavior changes. Run full tests, lint, type check, and build before staging deployment.

---

## File map

- `prisma/schema.prisma` and a new migration: Auth.js adapter fields, nullable password hash, per-user session version, provider accounts, and staging-safe SQL protections.
- `src/lib/social-auth.ts`: provider availability and new-account policy used by server configuration and UI.
- `src/lib/auth.ts`: Auth.js adapter/providers, OAuth callback rules, session fingerprint compatibility, credential login null handling.
- `src/lib/credential-version.ts`: fingerprint input for password and provider-only accounts.
- `src/app/actions/auth.ts`: safe password-change behavior for provider-only accounts.
- `src/components/auth/social-buttons.tsx`, `src/components/auth/forms.tsx`, `src/app/actions/social-auth.ts`, and Settings files: visible login, signup, and linking experience.
- `src/lib/*.test.ts`: policy and session regressions without external provider calls.
- `docs/staging/social-sign-in-setup.md`: callback URLs, environment variables, provider-console steps, and staging verification.

### Task 1: Persist provider identities

**Files:** Modify `prisma/schema.prisma`; create `prisma/migrations/20260916150000_social_accounts/migration.sql`.

**Interfaces:** Produce `prisma.account` keyed by `(provider, providerAccountId)`, optional `User.passwordHash`, and `User.authVersion String @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. Existing `User.id` and `User.email` remain unchanged.

- [ ] **Step 1: Add `Account` with `id`, `userId`, `type`, `provider`, `providerAccountId`, and optional Auth.js token columns; add `User.accounts`, `User.emailVerified`, `User.image`, `authVersion`, and nullable `passwordHash`.** Add an indexed `userId` and unique provider identity. SQL uses `ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL`, adds `"authVersion" UUID NOT NULL DEFAULT gen_random_uuid()`, creates `Account`, enables RLS, and grants no anonymous Data API access.
- [ ] **Step 2: Run `./node_modules/.bin/prisma validate` and generate a local Prisma client.** These checks must not connect to a database. Inspect the SQL and generated client; the staging database integration test occurs in Task 5.
- [ ] **Step 3: Review the schema diff and migration SQL.** Keep only Task 1 files in any commit.

### Task 2: Preserve sessions and password login

**Files:** Modify `src/lib/credential-version.ts`, `src/lib/auth.ts`, `src/app/actions/auth.ts`; test `src/lib/credential-version.test.ts` and a new `src/lib/social-session.test.ts`.

**Interfaces:** Keep `credentialFingerprint(passwordHash, secret)` compatible for existing password users. For provider-only users pass `oauth:${user.id}:${user.authVersion}` as the fingerprint source; `matchesCredentialFingerprint` rejects another keeper or a rotated version.

- [ ] **Step 1: Add failing cases:** a legacy bcrypt hash still validates its existing JWT; provider-only keeper A's version never validates B's token; password change revokes the prior token; null hash is rejected by credential login and password-change action without calling bcrypt.
- [ ] **Step 2: Run focused tests and confirm those failures.**
- [ ] **Step 3: Implement the smallest compatible version.** Keep the old password fingerprint input exactly for password accounts. For provider-only accounts use `oauth:${user.id}:${user.authVersion}` with the existing HMAC-based fingerprint. On the first OAuth JWT callback, load the keeper row and issue the correct fingerprint; on later callbacks compare it with the current row. Password login checks that a hash exists before bcrypt. Password change returns a clear provider-only message before bcrypt.
- [ ] **Step 4: Run focused tests and type checking.** Verify legacy sessions are not globally invalidated.
- [ ] **Step 5: Review code for account ID ownership and accidental token logging.**

### Task 3: Configure OAuth with safe account resolution

**Files:** Install `@auth/prisma-adapter` in `package.json` and lockfile; create `src/lib/social-auth.ts` and `src/lib/social-auth.test.ts`; modify `src/lib/auth.ts`.

**Interfaces:** `configuredSocialProviders(env)` returns only providers with both required credentials; Auth.js registers those providers and the Prisma adapter. Its sign-in policy requires a valid email for new accounts, rejects unverified Google email, and never enables `allowDangerousEmailAccountLinking`.

- [ ] **Step 1: Add failing policy tests** for each provider's missing/complete credentials, missing new-account email, Google `email_verified: false`, and an existing linked provider that later omits email.
- [ ] **Step 2: Run focused tests and confirm failure.**
- [ ] **Step 3: Install the adapter and configure Google, Apple, Facebook and PrismaAdapter.** Keep `session: { strategy: "jwt" }` and Credentials. Use provider account ID as the returning user's identity; use the existing Auth.js same-email collision error and authenticated linking behavior. Avoid broad social scopes and do not request offline refresh tokens.
- [ ] **Step 4: Run focused tests, `tsc --noEmit`, and lint for changed files.**
- [ ] **Step 5: Review the sign-in callback path for partial user creation on rejection and accidental email-only linking.**

### Task 4: Show sign-in and linking controls

**Files:** Create `src/components/auth/social-buttons.tsx` and `src/app/actions/social-auth.ts`; modify `src/components/auth/forms.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(app)/settings/page.tsx`.

**Interfaces:** Server-rendered availability determines which buttons appear. `startSocialSignIn(formData)` validates the provider against the configured allowlist, then calls `signIn(provider, { redirectTo: "/home" })`; `linkSocialProvider(formData)` requires a session and returns to Settings.

- [ ] **Step 1: Add a failing rendered-form or route test** asserting only configured providers appear and every visible button has an accessible text label. Add policy tests for disabling unavailable providers.
- [ ] **Step 2: Run the focused tests and confirm failure.**
- [ ] **Step 3: Add provider controls to login, registration, and Settings.** List linked providers from `prisma.account.findMany({ where: { userId: keeper.id } })`; show clear errors for OAuth cancellation, missing email, and same-email collision without leaking tokens. Do not add unlink UI in this release.
- [ ] **Step 4: Run focused tests, lint, and type checking.** Inspect mobile and keyboard states locally.
- [ ] **Step 5: Review copy: a linked method leads to the same keeper; Instagram is not shown.**

### Task 5: Stage and verify

**Files:** Create `docs/staging/social-sign-in-setup.md`; update staging environment only.

**Interfaces:** The stable staging domain is `https://spoodly-space-staging-beccapossibles-projects.vercel.app`; callbacks append `/api/auth/callback/{google,apple,facebook}`. Secrets stay in Vercel, never in documentation or chat.

- [ ] **Step 1: Document exact staging callback URLs, `AUTH_GOOGLE_ID/SECRET`, `AUTH_APPLE_ID/SECRET`, and `AUTH_FACEBOOK_ID/SECRET`, Apple Services ID/private key needs, and provider-console test mode requirements.**
- [ ] **Step 2: Run `npm test`, ESLint, TypeScript, and `next build --webpack`.** Confirm each exit code.
- [ ] **Step 3: Inspect the staging DB target with the existing guard, then apply only the new migration to staging.** No seed and no production DB access.
- [ ] **Step 4: Configure staging provider applications and secrets as account access permits.** Enable providers one at a time; deploy only the linked staging Vercel project.
- [ ] **Step 5: Verify new social account, returning sign-in, existing password-account linking, same-email collision, provider cancellation, missing email, and mobile/keyboard access on staging.** If provider credentials or developer-account access are unavailable, leave its button hidden and report exactly which provider remains unverified.
