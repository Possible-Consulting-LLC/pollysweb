# Staging initialization — 2026-09-15

## Verified result

- Supabase project: `nfdecdylxcmuypxodppe`, Spoodly Space Staging, free organization `rcvehdgkpbdlnqydjycu`.
- The dashboard confirmed Data API disabled before initialization.
- Connection validation required the exact staging pooler hostname, `postgres.nfdecdylxcmuypxodppe` username, database name, ports, TLS setting, and matching passwords. Connection values were not printed.
- Read-only preflight confirmed no tables in public before initialization.
- Five Prisma migrations applied successfully, including `20260915120000_harden_application_tables`; migration metadata reports all finished, none rolled back.
- Eleven application tables exist, each empty, with RLS enabled and no effective table privileges for anon/authenticated.
- Automatic RLS event trigger `ensure_rls` is enabled.
- Browser-role default table grants for postgres are absent after the configuration correction described below.

## Configuration correction

The creation form's disabled automatic table-exposure option did not remove the observed postgres/public default grants. With the Data API still disabled, applied this staging-only correction before creating tables:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
```

The preflight failed on those grants before correction and passed afterward. The additional reviewed application-table hardening SQL was copied unchanged into a new Prisma migration. Its leading review-copy comments describe its origin; the file is now an applied migration and must not be edited, since Prisma records its checksum.

## Local preparation and checks

- Worktree: `.worktrees/staging`; branch: `codex/staging-setup`.
- Repaired `package-lock.json` to match package.json; `npm ci --ignore-scripts --no-audit --no-fund` installed 533 packages successfully.
- Generated Prisma Client 6.19.3 explicitly after staging target validation.
- Pure unit tests with UTC timezone: 17 passed. This does not resolve the previously reported local-timezone test failure.
- `git diff --check` passed.
- The local connection file is gitignored and was created with permissions 0600. No credentials are included in this report.

## Remaining work

Vercel staging still needs its isolated environment configuration, deployment protection check, build preparation, and application deployment. Storage bucket setup and synthetic-data application testing have not occurred. The playground is not yet operational.

No seeds, resets, application data insertion, production database access, commits, pushes, or deployments occurred during this phase.
