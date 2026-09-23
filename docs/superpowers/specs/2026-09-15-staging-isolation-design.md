# Spoodly Space staging isolation

## Status and scope

The user approved separate Supabase and Vercel projects and selected a separate free Supabase organization. Infrastructure provisioning is in progress; application deployment and database initialization have not occurred.

### Provisioning status (2026-09-15)

- Created Supabase organization **Spoodly Space Staging**, Free ($0/month), ID `rcvehdgkpbdlnqydjycu`.
- Supabase project **Spoodly Space Staging** is created and reports Healthy, Free, Nano, West US (Oregon), reference `nfdecdylxcmuypxodppe`. Dashboard: https://supabase.com/dashboard/project/nfdecdylxcmuypxodppe
- The dashboard confirms no connected GitHub repository and no migrations. The creation form had Data API and automatic table exposure disabled and automatic RLS enabled; persisted security settings still need verification. No database commands have been run.
- Created Vercel project **spoodly-space-staging** in `beccapossibles-projects`, ID `prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`. Dashboard: https://vercel.com/beccapossibles-projects/spoodly-space-staging
- Vercel project is empty with no production or preview deployments and no connected Git repository. Environment configuration, protection verification, and application deployment remain pending.
- No database commands, commits, pushes, or production settings changes were performed during provisioning.

Establish one durable playground, `spoodly-space-staging`, for development, QA, and demonstrations using synthetic data. After isolation is verified, address all 24 findings in `CODE_REVIEW.md` in separate, tested groups. Those code fixes are a subsequent implementation phase.

## Non-negotiable constraints

- Never commit, merge, or push to `main` as part of this work.
- Run no database commands. This includes queries, dumps, schema introspection, migrations, resets, and seeds against production or staging until the user explicitly changes that restriction.
- Do not import production accounts, records, photos, payment identifiers, or secrets into staging.
- Do not execute the current seed script anywhere.
- Do not change production project settings or trigger production deployment.
- Do not push any branch until existing Vercel and Supabase Git automation has been inspected for side effects.
- Keep credentials out of chat, source control, screenshots, and this specification.
- Obtain explicit approval for additional recurring costs before project creation.

## Observed environment

- Repository: `BeccaPossible/spoodly-space`; local branch `main`, commit `12aee65`.
- Live Vercel project: `spoodly-space` in `beccapossibles-projects`, a Pro team.
- Live domains include `spoodlyspace.com`, `www.spoodlyspace.com`, and `spoodly-space.vercel.app`.
- Vercel explicitly identifies `main` as the live production branch. Existing non-main previews are present.
- Live Supabase project reference: `jfutawxwjqekerugbqzt`, region `us-west-2`, in the Spoodly Space Pro organization.
- Supabase's new-project screen quotes an additional $10/month for Micro compute in that organization. This cost has not yet been approved.
- The new-project screen requires a database password and defaults to exposing new tables through the Data API. Neither default will be accepted blindly.
- The user is signed in to both provider dashboards.

## Architecture

### Supabase

Create a distinct staging project in the new free organization `rcvehdgkpbdlnqydjycu`, using West US (Oregon). The user chose this option instead of the additional $10/month project in the existing Pro organization.

The project must have its own database, storage, keys, and credentials. Do not enable a repository integration that automatically executes migrations or seeds. Initial provisioning creates an empty service; the app will not be considered operational until a separately authorized schema-initialization step is complete.

The application uses Prisma and Auth.js, not Supabase user authentication. Disable automatic grants exposing newly created application tables, and enable automatic RLS where available. Leave the Data API disabled unless a concrete staging requirement is identified. Confirm storage behavior independently; the storage API must not receive broad anonymous write policies just to make uploads work.

Once database operations are authorized for this exact new project, review migrations before applying them, including replacing the migration behavior that disables RLS. Create only synthetic test accounts and example care history through a new safe fixture workflow or the app. Do not use production exports.

### Vercel

Create a separate project named `spoodly-space-staging` in the existing team. It receives no live custom domains. Its stable generated URL is the staging app's canonical URL.

Use a dedicated staging Git branch for this project's stable deployment and feature branches for candidate changes. A Vercel label of "Production" inside the staging project denotes that project's stable deployment only; the project ID and service credentials determine the actual isolation boundary.

Before linking/pushing branches, inspect current provider Git automation. If a branch push would create an unsafe preview of the live project or trigger database automation, use manual deployment to the new staging project until routing is safely resolved with user authorization.

Use the actual repository layout when setting the root directory. The local checkout has the Next.js package at the repository root; do not blindly copy an `apps/web` path displayed in a live dashboard link.

Enable available deployment protection for staging. Do not add billing webhook exceptions before their scope and authentication are designed. Start with email and Stripe integrations disabled, then enable test-only configurations in the relevant fix phase.

### Environment configuration

All relevant staging scopes must contain staging-only values. Do not inherit production credentials through team-level variables or integrations.

| Setting | Staging source |
| --- | --- |
| `DATABASE_URL`, `DIRECT_URL` | New staging project only; local use remains prohibited pending DB authorization |
| Supabase URL and keys | New staging project only |
| `AUTH_SECRET` | A distinct generated staging secret |
| `AUTH_URL`, `NEXTAUTH_URL` | Verified stable staging URL |
| Stripe key, prices, webhook secret | Disabled initially; later dedicated test/sandbox configuration |
| Resend/email settings | Disabled initially; later allowlisted test recipients |
| Environment marker | Explicit staging identity used for UI labeling and safety checks |

Do not copy `.env` from the current checkout into the development worktree. A local sample configuration contains names and placeholders only. Runtime and maintenance guards should reject the known production project reference when the environment is staging, require expected staging identities, and fail closed rather than falling back to live endpoints.

## Development workflow

1. Create an isolated worktree and a `codex/` branch after the written design review and implementation plan.
2. Preserve the existing review report and keep documentation off `main` commits.
3. Establish staging services without executing database commands or installing schema automatically.
4. Verify project IDs, domains, deployment routing, and credential scopes without revealing secrets.
5. Request narrowly scoped authorization for initializing only the named staging database; production remains prohibited.
6. Fix the unsafe seed workflow and dependency lockfile before relying on repeatable setup.
7. Address authentication/billing, data integrity/timezones, storage/history, and UI/accessibility with focused regression tests.
8. Run integration tests only after the staging target is verified and database access is explicitly authorized.
9. Produce reviewed changes and staging test evidence. Production release is a separate user decision.

## Verification and completion criteria

Infrastructure provisioning is complete when both new projects exist, their identities differ from live, staging has its own URL and secrets, production configuration is unchanged, and branch/deployment routing has been verified.

The playground is operational only after separately authorized schema initialization and synthetic-data tests verify login, profile creation, care history, and photo storage exclusively in staging. Empty infrastructure must not be presented as a functioning playground.

Local unit tests, lint, type checks, and builds must not load live environment files or make live service calls. Any commands or scripts with database side effects remain prohibited until specifically approved.

For billing tests, ensure only test credentials are accepted. For email tests, enforce an allowlist. Record target project references in verification output while excluding passwords and API keys.

## Required user actions and decisions

- Free organization option selected and organization created; no paid Supabase upgrade approved.
- Review this written specification before the implementation plan, as required by the invoked Superpowers brainstorming workflow.
- Enter and submit any new database password personally when the project creation form is ready. Browser credential-creation steps require user handoff.
- Separately authorize database commands for the exact staging project after isolation is established. Approval of this design does not lift the current database prohibition.

## Self-review

The design separates infrastructure provisioning from database initialization, identifies all live services that must remain untouched, and leaves no implicit permission to run commands against the database. Cost, credential entry, and staging database authorization are explicit gates rather than assumed approvals. No production deployment is part of this scope.
