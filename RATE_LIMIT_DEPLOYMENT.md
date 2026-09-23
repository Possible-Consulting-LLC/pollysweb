# Shared abuse limits: deployment prerequisite

The security update uses the existing PostgreSQL database for counters. It requires the additive migration `prisma/migrations/20260915130000_add_rate_limit_buckets/migration.sql`. The migration creates one server-only table and its expiry index; it enables RLS and revokes `PUBLIC` plus the Supabase `anon` and `authenticated` roles. It does not change keeper records.

**The migration has not been applied.** Review and obtain approval for the staging target before applying it. Do not deploy the new app first: login, registration, password changes and uploads fail closed if the table is absent or inaccessible. Feedback is also limited in production and remains disabled in staging. No new external service is required. No production changes are authorized by this document.

## Limits

| Action | Account | IP | Fixed window |
| --- | ---: | ---: | --- |
| Sign-in attempts (including successful attempts) | 10 | 60 | 15 minutes |
| Registration attempts | 3 | 10 | 1 hour |
| Password-change attempts | 5 | 20 | 15 minutes |
| Feedback attempts | 5 | 20 | 1 hour |
| Upload attempts | 50 | 150 | 24 hours |

Each upload is capped at 5 MiB before and after processing; the daily account quota bounds accepted image bytes to 250 MiB. It is a rolling storage-consumption control by fixed daily windows, not a total lifetime storage allowance. Failed validation attempts consume quota after authentication; requests with empty or oversized file declarations stop earlier. Fixed windows can allow up to twice the quota around a boundary. Counters use hashed identities, expire at window end, and up to 100 rows older than a day are removed per consumed bucket. These small extra database writes are intentional; they replace per-process limits that reset during cold starts.

On Vercel the limiter trusts only `x-vercel-forwarded-for`, which the platform overwrites. Self-hosting must set `RATE_LIMIT_TRUSTED_IP_HEADER` only to a header a controlled ingress **overwrites**, and block direct untrusted access to the app. Without a trusted header all clients share the conservative `unknown` IP bucket. Client-supplied `x-forwarded-for` is not trusted by default.

The database identity must have write access to this table and bypass RLS (the app already uses a privileged server connection). There are deliberately no public RLS policies. Do not give browser/API roles access to these counters.

## Session and upload compatibility

Existing session tokens without a credential fingerprint are rejected after this update. Users must sign in once; changing a password invalidates every previously issued token, including the current device, on its next authenticated request. The fingerprint is an HMAC of the password hash using the existing authentication secret, never the hash itself.

Uploads are fully decoded and re-encoded as static WebP, with metadata removed. JPEG, PNG, static WebP and static GIF inputs are supported. Animated and non-raster files are rejected. Dimensions are capped at 12,000 pixels per side and 40 million pixels. Disk fallback is development-only and uses generated filenames.

## Verification scope

Local fixture tests cover shared-store caller contention, fixed-window resets, account/IP rejection, unavailable-store rejection, trusted-header selection, credential rotation and malformed/oversized raster inputs. They make no database, storage or email calls. The PostgreSQL concurrency claim is based on the atomic conditional upsert; staging integration verification should follow the approved migration and precede deployment promotion. No database command, migration, seed, reset, external service provisioning or deployment was performed while preparing this change.
