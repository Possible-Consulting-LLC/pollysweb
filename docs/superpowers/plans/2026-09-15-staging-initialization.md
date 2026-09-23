# Staging Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and initialize only the new staging database, then connect the separate Vercel project.

**Architecture:** Retain historical Prisma migrations and add a separate security migration. Keep the Supabase Data API disabled throughout initialization. Supply only staging credentials to the empty Vercel project before deploying application code.

**Tech Stack:** Next.js, Prisma 6, PostgreSQL on Supabase, Vercel.

**Spec:** ../specs/2026-09-15-staging-isolation-design.md

## Global Constraints

- Never commit, merge, or push to `main` as part of this work.
- Run no database commands until explicitly approved for `nfdecdylxcmuypxodppe`.
- Never use production project `jfutawxwjqekerugbqzt`, its credentials, or its data.
- No seed or reset commands. No production configuration changes.
- Do not push any branch until existing Vercel and Supabase Git automation has been inspected for side effects.
- No commits are needed for this preparation phase.

## Task 1: Prepare isolated workspace and review package

**Files:** `docs/staging/environment.example`, `docs/staging/harden-application-tables.proposed.sql`, this plan.

- [x] Create `.worktrees/staging` on `codex/staging-setup`; ignore the worktree through local `.git/info/exclude` without modifying or committing main.
- [x] Copy the review report and approved design, excluding all environment files.
- [x] Inspect all four existing migrations as local text. Initial migration creates eleven application tables, indexes, and foreign keys; subsequent migrations add billing, memorial, and timezone fields. No row insertion or deletion is performed. Initial migration disables RLS and therefore requires the additional hardening step.
- [x] Prepare the exact additional SQL in `docs/staging/harden-application-tables.proposed.sql`. This is a review copy, not an executable migration in the migration directory.
- [x] Prepare a configuration reference with blank secrets and the verified staging Supabase URL.
- [x] Run existing pure unit tests without loading environment files. UTC baseline: 17 passed. Existing local-timezone regression from the original review remains unresolved. Reused installed test dependencies; did not run install hooks or Prisma commands.

## Task 2: Obtain narrow database authorization and credentials

- [x] Ask approval to initialize and verify only `nfdecdylxcmuypxodppe` using the four reviewed migrations plus the proposed hardening SQL. This authorization must include read-only schema verification afterward, and excludes seeds, resets, production, and user-data copying.
- [ ] Have the user enter the new database URLs and server key into secure staging-only configuration. Never ask for passwords in chat.
- [x] Verify the configured host/user identifies the exact staging reference without printing credentials. Reject other project references, local/live env fallback, and unrecognized pooler identities.
- [x] Verify persisted Supabase settings: Data API off, automatic grants off, automatic RLS on. Keep Data API off because historical initialization temporarily disables RLS.

## Task 3: Apply and verify approved staging schema

- [x] Copy the reviewed SQL unchanged into `prisma/migrations/20260915120000_harden_application_tables/migration.sql` in the worktree.
- [x] Resolve the reviewed dependency lockfile issue before relying on clean installation. Install with lifecycle scripts disabled. Prisma client generation is deferred until this phase is explicitly authorized.
- [x] With only verified staging connection values loaded, run the local Prisma CLI `migrate deploy --schema prisma/schema.prisma`. Do not use migrate dev, reset, db push, or seed. Prisma creates its own migration bookkeeping table as well as the application tables.
- [x] Verify the eleven expected tables, migration completion, RLS enabled on every application table, and absence of grants for PUBLIC/anon/authenticated. Inspect only schema metadata. If a migration fails, stop; do not reset the database or automatically mark it resolved.
- [x] Confirm no application records have been inserted. No synthetic accounts are created in this schema-only phase.

## Task 4: Connect and deploy staging

- [ ] In Vercel project `prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`, fill the configuration reference with staging-only values. Check team/shared variables for inherited production values. Keep Stripe and Resend blank.
- [ ] Verify deployment protection and the generated domain before setting AUTH_URL. Do not attach live domains.
- [ ] Before deployment, fix the missing ignore-command script and implement tested guards rejecting production endpoints in staging. Review build scripts for database side effects; no migrations in install/build hooks.
- [ ] Audit Git automation before any push, or deploy manually to the exact new Vercel project. Use repository root as application root.
- [ ] Configure the separate `spoods` storage bucket and its intended read visibility through a separately reviewed storage setup. No anonymous write policies. This schema proposal does not modify storage or auth schemas.
- [ ] Obtain approval for synthetic-data application testing if the schema-only authorization has not been expanded. Verify registration/login and photo uploads on staging before describing the playground as operational.

## Current verification limits

Initialization and read-only database verification completed on 2026-09-15; see ../../staging/initialization-results.md. Vercel deployment, storage, and application testing remain pending. The following describes the pre-execution baseline, superseded by that report:

SQL had been reviewed as text only. Database execution, permission behavior, connections, builds, and deployed application behavior are not yet verified. The schema proposal deliberately preserves historical migration checksums; the extra migration restores RLS after initialization while Data API remains disabled. The 24 application review findings are tracked separately and are not claimed fixed by this preparation.

## Execution note

The user approved staging-only initialization and verification. Preflight found public-table defaults for postgres still granted all privileges to anon/authenticated despite the creation form setting. Corrected that staging setting with `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated` before migration deployment, then verified no browser table defaults remain. Historical migration files and the approved hardening SQL were applied unchanged. Database URLs are configured in the ignored local file; storage server key and Vercel secrets remain pending.
