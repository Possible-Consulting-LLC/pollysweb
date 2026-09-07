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
