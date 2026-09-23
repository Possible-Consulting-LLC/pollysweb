# Care Constellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each keeper one shared care streak and an illustrated gallery of care and spood-story rewards.

**Architecture:** A completed `CareDay` is an immutable, authenticated snapshot of one day's review of all active spoods. Pure functions calculate streaks and rewards; server code validates today's checklist against current care data and derives story rewards from existing history. Home links to a dedicated Constellation page.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 6, PostgreSQL, TypeScript, Node test runner, Tailwind CSS.

**Spec:** `../specs/2026-09-16-care-constellation-design.md`

## Global Constraints

- Never commit, merge, or push to `main`; use only the existing isolated staging worktree.
- Run no database commands, including queries, migrations, seeds, resets, or schema introspection. Do not run `prisma generate` in this phase. Prepare migration SQL as a reviewable file only.
- Do not deploy code that reads `CareDay` until that migration is separately authorized and applied to the isolated staging project.
- No badge may reward feeding count, fasting, handling, breeding, or the number of owned spoods.
- Keep existing authentication and ownership checks for every new server read/write.

---

## File structure

- `src/lib/constellation.ts`: pure calendar-day, streak, reward, and checklist rules.
- `src/lib/constellation.test.ts`: behavioral tests for those rules.
- `src/lib/constellation-data.ts`: authenticated, user-scoped reads of care days and story events. Use parameterized `$queryRaw` for `CareDay` until client generation is authorized; use generated Prisma models for existing events.
- `src/app/actions/constellation.ts`: authenticated review submission and idempotent `CareDay` insert.
- `src/components/constellation/`: small components for day review, streak preview, and vector reward gallery.
- `src/app/(app)/constellation/page.tsx`: page composition.
- `src/app/(app)/home/page.tsx`: compact streak card linking to the page.
- `prisma/schema.prisma` and `prisma/migrations/20260916120000_care_days/migration.sql`: additive table and server-only access controls.

## Task 1: Calendar and reward rules

**Files:** Create `src/lib/constellation.ts`, `src/lib/constellation.test.ts`.

**Interfaces:**

```ts
type StreakSummary = { current: number; best: number; earnedAt: Partial<Record<1 | 3 | 7 | 14 | 30 | 100, string>> };
function calendarDayKey(date: Date, timeZone: string): string;
function summarizeStreak(dayKeys: string[], todayKey: string): StreakSummary;
function checkCareDay(input: { activeSpiderIds: string[]; reviewedSpiderIds: string[]; due: Record<string, { feeding: boolean; misting: boolean }>; deferred: Record<string, { feeding?: string; misting?: string }> }): { ok: true } | { ok: false; error: string };
```

- [x] Write behavioral tests using `node:test` for timezone and DST date keys, 1/3/7/14/30/100 unlocks, incomplete today, broken streak, duplicate days, empty active collection, missing reviews, and missing reasons for due items.
- [x] Run the focused tests and observe the missing-feature failures before implementation.
- [x] Implement the pure rules with keeper-zone date keys and first-earned threshold dates.
- [x] Run the focused tests again and confirm every assertion passes.

## Task 2: CareDay persistence and submission

**Files:** Modify `prisma/schema.prisma`; create `prisma/migrations/20260916120000_care_days/migration.sql`, `src/lib/constellation-data.ts`, `src/app/actions/constellation.ts`.

**Interfaces:** `getConstellationData(userId: string, now?: Date)` returns the completed day keys, streak summary, review inputs, and story reward data. `completeCareDay(formData: FormData): Promise<ActionResult>` accepts a `reviewed` list and `defer:<spiderId>:feeding|misting` reason fields; it ignores unsolicited IDs.

- [x] Write rule tests for molting, misting, feeding suppression, and unresolved due items.
- [x] Run focused tests and confirm expected failure.
- [x] Add the `CareDay` model and an additive, unapplied SQL migration with RLS and grant revocation.
- [x] Implement user-scoped, parameterized reads and aggregate story queries with no historical truncation.
- [x] Implement authenticated, idempotent review submission with a final server recheck and an active-set/day guard at insert.
- [x] Run focused tests without any database or Prisma CLI command.

## Task 3: Story rewards and gallery

**Files:** Extend `src/lib/constellation.ts` and its test; create `src/components/constellation/reward-gallery.tsx` with app-owned vector medallions.

**Interfaces:** `deriveStoryRewards(spiders, todayKey, timeZone, now?)` returns grouped reward instances with qualifying spood IDs and dates; `STORY_REWARDS` and `STREAK_REWARDS` contain the 12 names and criteria.

- [x] Write behavioral tests for portrait uploads, successful molts, hammock observations, Spoodiversary, optional Play exclusion, future events, and grouped dates.
- [x] Run focused tests and confirm expected failures.
- [x] Implement reward derivation and vector medallions; keep criteria visible and link earned story details to each spood.
- [x] Run focused tests and lint.

## Task 4: Home, checklist, and dedicated page

**Files:** Create `src/components/constellation/care-review.tsx`, `src/components/constellation/streak-card.tsx`, `src/app/(app)/constellation/page.tsx`; modify `src/app/(app)/home/page.tsx`.

- [x] Test that a review cannot complete without every active spood and reasons for unresolved due items.
- [x] Add the Home card and `/constellation` page with current/best streak, seven-day trail, checklist, and gallery while preserving bottom navigation.
- [x] Run focused tests, the full unit suite, and lint.

## Task 5: Final verification and release boundary

**Optional Play & interaction:** Implemented as an `ObservationEvent` with date/time, validated method, and optional notes. It includes both in-enclosure activities and voluntary handling; it has no streak or badge criterion. The accepted-method and Other-field tests failed before the formatter was implemented.

- [x] Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and a local webpack production build after staging-only database access was authorized.
- [x] Inspect the migration and feature diff for production references, credentials, ownership gaps, and accidental main changes. Type checking works without Prisma generation because the new table is accessed through parameterized raw queries.
- [x] After explicit staging-only database authorization, verify the target, apply the single pending `CareDay` migration, and confirm migration status is current. Deploy to the separate staging Vercel project and verify its stable alias, health endpoint, Constellation page, and Play/date controls. No production database access, seed, or main-branch commit.
