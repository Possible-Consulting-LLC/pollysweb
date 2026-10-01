# Spoodly Space

**Your little corner of the web.**  
Track. Care. Celebrate.

Spoodly Space is a cute, beginner-friendly jumping spider care and tracking app. Open it, see who needs attention today, log care in seconds, and keep a scrapbook-style life story for each spood.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS** for mobile-first UI
- **Prisma** + **Supabase PostgreSQL**
- **Auth.js (NextAuth v5)** credentials auth
- Zod validation + server actions

Database is hosted on Supabase. Copy `.env.example` to `.env` and fill in your Supabase connection strings.

## Features (MVP)

- Home dashboard: who needs care today
- My Spoods + search/filter
- Add a Spood
- Spider profiles with quick logs (feed, mist, molt, observation)
- Feeding (offered vs successful), misting, molt tracking with auto instar update
- Premolt mode that pauses feeding reminders
- Body condition observations
- Enclosure + maintenance
- Spoodly Story timeline
- Activity history
- Settings + reminder defaults (push-ready architecture)
- Demo seed data (Star and friends)

## Getting started

```bash
npm install
cp .env.example .env   # set DATABASE_URL + DIRECT_URL from Supabase
npx prisma migrate deploy
npm run db:seed
npm run dev
```

App runs at [http://127.0.0.1:43123](http://127.0.0.1:43123).

### Demo account

- Email: `demo@spoodly.space`
- Password: `spoodly123`

## Deploy on Vercel

If login hits `/api/auth/callback/credentials` with:

> There was a problem with the server configuration.

Auth.js is missing `AUTH_SECRET` (or the DB URL) in the Vercel project. Set these under **Project → Settings → Environment Variables** for **Production** (and Preview if you use it):

| Variable | Value |
|----------|--------|
| `AUTH_SECRET` | Long random string (`openssl rand -base64 32`) |
| `AUTH_URL` | `https://www.your-public-domain.com` — MUST be the public custom origin |
| `NEXTAUTH_URL` | `https://www.your-public-domain.com` — MUST be the public custom origin |
| `DATABASE_URL` | Supabase **Transaction** pooler URI (port `6543`, `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase **Session** URI (port `5432`) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jfutawxwjqekerugbqzt.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret/service-role key used only by the server for the private `spoods` bucket |
| `RESEND_API_KEY` | Resend API key for feedback emails to `support@spoodlyspace.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret for `/api/stripe/webhook` |
| `STRIPE_PRICE_MONTHLY` | Price ID for $1.99/month |
| `STRIPE_PRICE_YEARLY` | Price ID for $19.99/year |
| `STRIPE_PRO_LEGACY_PRICE_IDS` | Optional comma-separated Pro Price IDs still used by existing subscriptions or open checkouts |

robots.txt follows the AUTH_URL/NEXTAUTH_URL hostname — it must be the public custom origin, never a Vercel alias.

Then **Redeploy** (Deployments → ⋮ → Redeploy). Env changes do not apply to an already-running deployment until you redeploy.

**Plans:** Free includes 1 active spood (memorialized / passed spiders don’t count). Spoodly Pro is $1.99/month or $19.99/year (Stripe Checkout).

Before changing either current Pro Price ID, add the old ID to `STRIPE_PRO_LEGACY_PRICE_IDS` and redeploy. Keep it allowlisted while subscriptions or open checkouts still use it. An unknown price on an app-created subscription pauses new checkout for review to avoid duplicate charges.

Check [https://spoodly-space.vercel.app/api/health](https://spoodly-space.vercel.app/api/health). It returns only `{ "ok": true }` when authentication, database configuration, private photo storage, and service maintenance readiness pass.

**Where accounts live:** Spoodly uses Prisma tables in Postgres, not Supabase Auth. Look in **Table Editor → `User`**, not **Authentication → Users**.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server on port 43123 |
| `npm run build` | Production build |
| `npm test` | Care-logic unit tests |
| `npm run db:seed` | Seed demo keeper + Star |
| `npm run db:reset` | Reset DB and re-seed |

## Architecture notes

- **UI** in `src/app` and `src/components`
- **Domain logic** in `src/lib/care.ts` (status derivation, molt math, reminder suppression)
- **Data access** in `src/lib/spiders.ts`
- **Mutations** via server actions in `src/app/actions`
- Reminders store interval + enabled flags so native push can be added later (Capacitor / native clients)

## Mobile future

Designed mobile-first with large touch targets and bottom navigation. The same API/data layer can later power Capacitor or native clients — no desktop-only interactions are required.
