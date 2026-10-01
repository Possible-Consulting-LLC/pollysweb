# Polly's Web Public Site & Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public-facing site as Polly's Web per the nine `mockups/public-*.png` mockups, add a CMS-ready content layer (blog, legal, care guides), restyle auth pages, and fully rebrand the product — delivered in **vertical slices**, each ending at a human review gate.

**Architecture:** New `src/app/(marketing)` route group with a single shared layout (header/footer), a filesystem content layer (`src/content/*.md` + typed loaders) introduced in the first content slice and extended per slice, DB-driven adaptive pricing, and a brand-constant sweep across the app.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Prisma/Supabase, Auth.js v5, `marked` + `github-slugger` (new deps), node:test.

**Spec:** `docs/superpowers/specs/2026-10-01-pollys-web-public-site-design.md`

**Slicing contract:** Each slice ends with `npm test && npm run lint && npm run build` green, rendered pages presented for review, and **no work on the next slice until explicit sign-off**. Art placeholders are labeled gradient placeholders until real exports land (swap = drop files in `public/images/…`, no code change).

## Global Constraints

- Tagline everywhere: **"Happier, Healthier Spoods."** (verbatim, with period)
- Brand name: **Polly's Web**; support emails `support@/bugs@/ideas@/partnerships@pollysweb.com`
- Header nav (7, in order): Features · Care Guides · Blog · Pricing · About · Help · Contact; logo → `/`; no search
- Footer: `public-contact.png` dark variant on every public page; Quick Links (7 incl. Blog), Legal column (9 docs, no Overview), "Join Our Spood Community" newsletter box
- No redirects for old `/privacy`, `/terms`, `/data-deletion` paths — they are deleted
- Provider buttons render only what `configuredSocialProviders(process.env)` returns (today: facebook, google — never apple)
- Pricing cards come from the live plan catalog via `summarizePlanForPricing()`; Breeder/Decorator add-ons are static "Coming Later" cards
- No dashboard (`mockups/dashboard-*`), no blog comments/search, no public site search, no Apple OAuth
- Tests: `node:test` + `assert/strict`, colocated `*.test.ts`, run via `npm test`; commits per task

## Review Focus

1. **Draft leakage** — content with `draft: true` must appear in no listing or route in production. Test: Task 5 (`content-loaders.test.ts`).
2. **Catalog shape drift** — plan with no active price option, or 1/2/4+ plans, must render "Contact us" / adapt grid, never break. Tests: Task 11 (`public-pricing.test.ts`).
3. **Unconfigured provider leakage** — an env missing FB/Google credentials must produce no button for it. Test: Task 13 (`social-buttons` render-data test).
4. **Newsletter abuse/duplicates** — duplicate email and rate-limited submits return friendly messages; writes respect maintenance mode. Tests: Task 3.
5. **Old-route removal** — `/privacy`, `/terms`, `/data-deletion` must not exist as routes and unknown slugs must render the marketing-chrome 404. Verification: Task 6 + group `not-found.tsx` (Task 2).

---

## Slice 1 — Fully-built, reviewable homepage

### Task 1: Brand constants & logo assets

**Files:**
- Modify: `src/lib/brand.ts`
- Create: `scripts/build-brand-assets.ts`, `public/brand/pollys-logo-mark.png`, `public/brand/pollys-logo-white.png`, `public/brand/pollys-logo-icon.png`
- Test: `src/lib/brand.test.ts`

**Interfaces:**
- Produces: `export const BRAND = { name: "Polly's Web", tagline: "Happier, Healthier Spoods.", emails: { support: "support@pollysweb.com", bugs: "bugs@pollysweb.com", ideas: "ideas@pollysweb.com", partnerships: "partnerships@pollysweb.com" }, social: { instagram: "", youtube: "", tiktok: "", facebook: "", pinterest: "" } } as const;` — plus existing `BRAND_LOGO_SRC = "/brand/pollys-logo-mark.png"` and `BRAND_ICON_SRC` (same `_next/image` pattern as today). Empty social values mean "hide the icon" (Task 2 consumes).

- [ ] **Step 1: Write the failing test** (`src/lib/brand.test.ts`)

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, BRAND_LOGO_SRC } from "./brand";

test("brand constants carry the approved copy", () => {
  assert.equal(BRAND.name, "Polly's Web");
  assert.equal(BRAND.tagline, "Happier, Healthier Spoods.");
  assert.equal(BRAND.emails.support, "support@pollysweb.com");
});
test("logo points at the new mark", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/pollys-logo-mark.png");
});
```

- [ ] **Step 2: Run to fail** — `npm test -- src/lib/brand.test.ts` → FAIL
- [ ] **Step 3: Implement** — extend `src/lib/brand.ts` with `BRAND` (values above; socials empty strings) and repoint `BRAND_LOGO_SRC`. Write `scripts/build-brand-assets.ts` using `sharp` (already a dep) to process `mockups/logo.png` → the three PNGs (mark ~512w, white variant via flatten/composite, icon 180w). Run it once (`npx tsx scripts/build-brand-assets.ts`); the script is idempotent tooling, not part of the app bundle.
- [ ] **Step 4: Run to pass** — same command → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: pollys-web brand constants and logo assets"`

### Task 2: Marketing chrome — header, footer, group layout

**Files:**
- Create: `src/components/marketing/nav.ts`, `src/components/marketing/site-header.tsx`, `src/components/marketing/site-footer.tsx`, `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/not-found.tsx`, `src/app/(marketing)/error.tsx`
- Test: `src/components/marketing/nav.test.ts`

**Interfaces:**
- Produces (in `nav.ts`): `export type NavKey = "features" | "care-guides" | "blog" | "pricing" | "about" | "help" | "contact";` `export const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string }>` (7, order per Global Constraints), `export const FOOTER_LEGAL_SLUGS = ["terms-of-service","privacy-policy","cookie-policy","community-guidelines","acceptable-use","copyright","disclaimer","data-deletion","accessibility"] as const;` `export function activeNavKey(pathname: string): NavKey | null` (exact href match; `/care-guides/xyz` → `"care-guides"`).
- Consumes: `BRAND` (Task 1).

- [ ] **Step 1: Write the failing test** — assert `NAV_ITEMS` length 7, hrefs `/features /care-guides /blog /pricing /about /help /contact` in order; `activeNavKey("/care-guides/molting") === "care-guides"`; `activeNavKey("/") === null`; `FOOTER_LEGAL_SLUGS` has exactly the 9 pinned slugs.
- [ ] **Step 2: Run to fail** — `npm test -- src/components/marketing/nav.test.ts` → FAIL
- [ ] **Step 3: Implement** — `nav.ts` per signatures. `site-header.tsx`: logo (BRAND_LOGO_SRC) → `/`, desktop nav with active highlighting (`aria-current="page"`), `Sign In`/`Sign Up` links to `/login`, `/register`, mobile hamburger (client component, plain state toggle). `site-footer.tsx`: dark-purple footer per mockup — logo + tagline, Quick Links (7), Legal column (9 slugs → `/legal/{slug}`), newsletter slot (form arrives in Task 3), social icons (lucide) rendered only for non-empty `BRAND.social` values, © 2026 Polly's Web. `(marketing)/layout.tsx` renders `<SiteHeader/><main>{children}</main><SiteFooter/>`. `not-found.tsx`/`error.tsx` use the same chrome.
- [ ] **Step 4: Run to pass** — nav test PASS; `npm run build` compiles (route group with only layout+not-found is valid).
- [ ] **Step 5: Commit** — `git commit -m "feat: shared marketing header/footer chrome and 404/error pages"`

### Task 3: Newsletter subscription

**Files:**
- Modify: `prisma/schema.prisma` (add model), `src/components/marketing/site-footer.tsx` (slot → real form)
- Create: `prisma/migrations/<ts>_newsletter_subscribers/migration.sql` (via `npm run db:migrate:dev`), `src/app/actions/newsletter.ts`, `src/components/marketing/newsletter-form.tsx`
- Test: `src/app/actions/newsletter.test.ts` (pure validation fn)

**Interfaces:**
- Produces: Prisma model `NewsletterSubscriber { id String @id @default(cuid()) email String @unique createdAt DateTime @default(now()) }`; action `subscribeToNewsletter(prevState: unknown, formData: FormData): Promise<{ ok: boolean; message: string }>` — zod email parse, `allowAction("newsletter", email)` rate limit, duplicate → `{ ok: true, message: "You're already on the list." }`, success → `{ ok: true, message: "Subscribed! Watch your inbox." }`; gate on the maintenance/site-status pattern used by other public writes (see `src/lib/maintenance-write.ts`, `src/lib/site-status-model.ts`).
- Consumes: `allowAction`, `RATE_LIMIT_MESSAGE` (`@/lib/rate-limit`).

- [ ] **Step 1: Write the failing test** — pure helper `validateNewsletterInput(raw: unknown): { email: string } | { error: string }`: invalid email → error; valid → lowercased email; empty → error.
- [ ] **Step 2: Run to fail** → FAIL. **Step 3: Implement** model + migration (`npm run db:migrate:dev -- --name newsletter_subscribers`), helper, action, `newsletter-form.tsx` following the repo's `useActionState` form conventions (`src/components/mutation-form.tsx` patterns), wire into footer box titled "Join Our Spood Community".
- [ ] **Step 4: Run to pass** → PASS. **Step 5: Commit** — `git commit -m "feat: newsletter subscription action and footer form"`

### Task 4: Home page

**Files:**
- Delete: `src/app/page.tsx`
- Create: `src/app/(marketing)/page.tsx`
- Reuse: `LandingAppPreview` (`src/components/landing/app-preview`)

**Interfaces:**
- Consumes: `BRAND`, `getSessionUser` (existing redirect-into-app behavior preserved verbatim).
- Produces: metadata `{ title: "Polly's Web — Jumping spider care, all in one place" }`; page copies `mockups/public-home.png` copy verbatim where legible ("A Happier Home for Every Spood", "Spoodly Space is joining the Proservability family! …", "THOUGHTFUL CARE. AMAZING JUMPERS." eyebrow) — banner, hero, 5 feature cards, app preview, community CTA, value props.

- [ ] **Step 1: Move + rebuild** the page (no unit test — visual page; assertions live in Task 15 baselines). Preserve the logged-in redirect logic from the old file verbatim.
- [ ] **Step 2: Verify** — `npm run build` green; render `/` against the mockup.
- [ ] **Step 3: Commit** — `git commit -m "feat: pollys-web home page per public-home mockup"`

### 🛑 REVIEW GATE 1

Present rendered `/` (desktop + mobile) against `mockups/public-home.png`. User signs off on copy, layout, chrome, placeholder treatment **before Slice 2 begins**.

---

## Slice 2 — Legal system (content layer introduced here)

### Task 5: Content core — markdown, frontmatter, legal loader

**Files:**
- Modify: `package.json` (add `marked`, `github-slugger`)
- Create: `src/lib/content/schema.ts`, `src/lib/content/markdown.ts`, `src/lib/content/legal.ts`, `src/lib/content/fixtures/legal/*.md`
- Test: `src/lib/content/content-loaders.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(source: string): { html: string; toc: Array<{ id: string; text: string; level: 2 | 3 }> }` (marked → HTML; TOC from `^#{2,3} ` source lines, ids via one shared `GithubSlugger` walking in order). `LegalFrontmatter { title: string; slug: string; order: number; lastUpdated: string(YYYY-MM-DD); draft?: boolean }` (zod). Loader with injectable root: `listLegalDocs(root?): LegalDocMeta[]` (sorted by `order`), `getLegalDoc(slug, root?): LegalDocMeta & { html: string; toc: TocEntry[] } | null`. Draft filtering is unconditional. `CONTENT_ROOT = path.join(process.cwd(), "src", "content")`.
- Note: plain `.md` (no JSX needed); guides/blog loaders arrive in their slices reusing this core.

- [ ] **Step 1: Write the failing tests** — fixtures: valid doc, `draft: true` doc, malformed frontmatter, duplicate slug. Assert: drafts never listed/gettable; malformed throws with filename; `order` sorting; `renderMarkdown("## Hello\n\ntext")` → toc `[{ id: "hello", text: "Hello", level: 2 }]` + html containing `<h2 id="hello">`.
- [ ] **Step 2: Run to fail** → FAIL. **Step 3: Implement** (`npm install marked github-slugger`). **Step 4: Run to pass** → PASS. **Step 5: Commit** — `git commit -m "feat: content core — markdown rendering, frontmatter schema, legal loader"`

### Task 6: Legal documents, hub, doc pages; remove legacy routes

**Files:**
- Create: `src/content/legal/{overview,terms-of-service,privacy-policy,cookie-policy,community-guidelines,acceptable-use,copyright,disclaimer,data-deletion,accessibility}.md` (3 migrated from old page bodies; 7 drafted)
- Create: `src/app/(marketing)/legal/page.tsx`, `src/app/(marketing)/legal/[slug]/page.tsx`
- Delete: `src/app/privacy/`, `src/app/terms/`, `src/app/data-deletion/`
- Test: `src/content/legal/legal-content.test.ts`

**Interfaces:**
- Consumes: `listLegalDocs`, `getLegalDoc` (Task 5); `FOOTER_LEGAL_SLUGS` (Task 2).
- Produces: hub = two-column per mockup (left doc list + "Questions?" card; right "Our Commitment" intro + 3×3 grid of the 9 grid docs; Overview reachable from doc list). Doc page = breadcrumb `Legal › {title}`, left sidebar (all docs, current highlighted), right "In This Article" TOC, "Last updated {date}", prev/next by `order`.

- [ ] **Step 1: Write the failing content test** — 10 files exist, slugs unique, every `FOOTER_LEGAL_SLUGS` slug resolvable, migrated docs contain a sentinel phrase from each old body, cookie doc mentions session cookie and does not mention advertising.
- [ ] **Step 2: Run to fail** → FAIL.
- [ ] **Step 3: Author content** — migrate 3, draft 7 (cookie doc enumerates actual cookies from `src/lib/auth.ts` config; plain factual language, no invented claims; user reviews wording at the gate).
- [ ] **Step 4: Build pages**, delete old routes. **Step 5: Run to pass** + `npm run build`. **Step 6: Commit** — `git commit -m "feat: legal hub and 10 policy documents; remove legacy legal routes"`

### 🛑 REVIEW GATE 2

Present `/legal` + 2–3 sample doc pages; flag drafted legal wording for review. Sign-off before Slice 3.

---

## Slice 3 — Care guides

### Task 7: Guides loader + 8 articles

**Files:**
- Create: `src/lib/content/care-guides.ts`, `src/lib/content/fixtures/guides/*.md`, `src/content/guides/{feeding,water,molting,handling,cleaning,life-stages,health,species-profiles}.md`
- Test: extend `src/lib/content/content-loaders.test.ts` + `src/content/guides/guides-content.test.ts`

**Interfaces:**
- Produces: `GuideFrontmatter { title: string; slug: string; category: GuideCategory; icon: string; readingTime: number; excerpt: string; draft?: boolean }`; `export const GUIDE_CATEGORIES = [{key:"feeding",label:"Feeding"},{key:"water",label:"Water"},{key:"molting",label:"Molting"},{key:"handling",label:"Handling"},{key:"cleaning",label:"Cleaning"},{key:"life-stages",label:"Life Stages"},{key:"health",label:"Health"},{key:"species-profiles",label:"Species Profiles"}] as const;` `listGuides(root?)`, `getGuide(slug, root?)` (same shape as legal loader).

- [ ] **Step 1: Failing tests** — loader fixtures (draft filtering, category validation); content test: 8 files, one per category, slugs unique, `readingTime` ≥ 1.
- [ ] **Step 2: Fail → Step 3: Implement loader + author 8 guides** (beginner-friendly, original; species-profiles covers Phidippus regius, S. magnifica, H. apacheanus per mockup). **Step 4: Pass.** **Step 5: Commit** — `git commit -m "feat: guides loader and 8 care guide articles"`

### Task 8: Guide listing + article pages

**Files:**
- Create: `src/app/(marketing)/care-guides/page.tsx`, `src/app/(marketing)/care-guides/[slug]/page.tsx`

**Interfaces:**
- Consumes: `listGuides`, `getGuide`, `GUIDE_CATEGORIES`.
- Produces: listing per mockup (hero, 8 chips filtering cards client-side, "Start Here: Your First 3 Steps" → habitat/feeding/molting guides, community banner); article page with category chip, icon, reading time, TOC.

- [ ] **Step 1: Build pages** (chips = client component filtering `listGuides()` output). **Step 2: build green.** **Step 3: Commit** — `git commit -m "feat: care guides listing and article pages"`

### 🛑 REVIEW GATE 3

Present `/care-guides` + sample articles vs mockup. Sign-off before Slice 4.

---

## Slice 4 — Blog

### Task 9: Blog loader + 3 seed posts

**Files:**
- Create: `src/lib/content/blog.ts`, `src/lib/content/fixtures/blog/*.md`, `src/content/blog/{welcome-to-pollys-web,first-week-with-your-jumper,feeding-basics-101}.md`
- Test: extend `src/lib/content/content-loaders.test.ts` + `src/content/blog/blog-content.test.ts`

**Interfaces:**
- Produces: `BlogFrontmatter { title: string; slug: string; date: string(YYYY-MM-DD); excerpt: string; tags: string[]; cover?: string; draft?: boolean }`; `listBlogPosts(root?)` (date desc), `getBlogPost(slug, root?)`.

- [ ] **Step 1: Failing tests** — loader fixtures (date-desc, draft filtering); content test: 3 posts, unique slugs. **Step 2: Fail → Step 3: Implement + author posts** (rebrand welcome + 2 care posts). **Step 4: Pass.** **Step 5: Commit** — `git commit -m "feat: blog loader and seed posts"`

### Task 10: Blog index + post pages

**Files:**
- Create: `src/app/(marketing)/blog/page.tsx`, `src/app/(marketing)/blog/[slug]/page.tsx`

**Interfaces:**
- Consumes: `listBlogPosts`, `getBlogPost`, `NewsletterForm` (Task 3).
- Produces: index = featured (newest) + card grid; post = cover, prose, tags, newsletter CTA, prev/next by date.

- [ ] **Step 1: Build pages.** **Step 2: build green.** **Step 3: Commit** — `git commit -m "feat: blog index and post pages"`

### 🛑 REVIEW GATE 4

Present `/blog` + sample post. Sign-off before Slice 5.

---

## Slice 5 — Pricing (DB-driven, adaptive)

### Task 11: Pricing module + page

**Files:**
- Create: `src/lib/public-pricing.ts`, `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/admin/plans/actions.ts`, `src/app/admin/features/actions.ts` (add `revalidatePath('/pricing')` beside existing revalidates)
- Test: `src/lib/public-pricing.test.ts`

**Interfaces:**
- Consumes: `summarizePlanForPricing` (`@/lib/features/pricing`); plan catalog reads as admin does (`src/lib/admin/plans.ts`).
- Produces: `type PublicPlan = { id: string; name: string; blurb: string | null; monthlyCents: number | null; annualCents: number | null; features: Array<{ name: string; category: string }> };` `loadPublicPricing(): Promise<PublicPlan[]>` (catalog order; null prices when no active option); `pricingGridClass(count: number): string` (1→centered max-w, 2→2-col, 3→3-col mockup default, 4+→4-col wrap); `annualSavingsPercent(monthly, annual): number | null` (null unless both > 0; `round((1-annual/(monthly*12))*100)`); `ctaForPlan(plan, isCurrentPlan, isAuthed): { label: string; href: string }` — anonymous: Free→"Start Free"→`/register`, paid→"Get {name}"→`/register`; authed non-current→"Upgrade to {name}"→`/upgrade`; current→"Your current plan" (no href).
- Page: `export const dynamic = "force-dynamic";` static "Coming Later" section (Breeder $4.99/mo, Decorator $2.99/mo), billing FAQ strip, "Contact us" state when both prices null.

- [ ] **Step 1: Failing tests** — grid classes for counts 1,2,3,4; savings (199/1999 → 16%; annual-only → null; zeros → null); CTA mapping all four branches.
- [ ] **Step 2: Fail → Step 3: Implement module + page → Step 4: Pass** + add `revalidatePath('/pricing')` lines. **Step 5: Commit** — `git commit -m "feat: DB-driven adaptive pricing page"`

### 🛑 REVIEW GATE 5

Present `/pricing` against mockup with real catalog data. Sign-off before Slice 6.

---

## Slice 6 — Features, About, Help, Contact

### Task 12: Four pages + contact action

**Files:**
- Create: `src/app/(marketing)/features/page.tsx`, `about/page.tsx`, `help/page.tsx`, `contact/page.tsx`, `src/app/actions/contact.ts`, `src/components/marketing/faq-accordion.tsx`, `src/components/marketing/contact-form.tsx`
- Test: `src/app/actions/contact.test.ts`

**Interfaces:**
- Consumes: `BRAND.emails`; Resend transport pattern from `src/lib/feedback-delivery.ts`.
- Produces: `contactTargetFor(topic: "support" | "bugs" | "ideas" | "partnerships"): string` → BRAND email; `sendContactMessage(prevState: unknown, formData: FormData): Promise<{ ok: boolean; message: string }>` — zod (name, email, topic enum, message ≤ 2000), `allowAction("contact", email)`. Pages copy their mockups (features grid; about incl. rebrand story + "formerly Spoodly Space"; help topic cards + FAQ accordion; contact channels + form).

- [ ] **Step 1: Failing test** — `contactTargetFor` maps all four topics to the four brand emails.
- [ ] **Step 2: Fail → Step 3: Implement action + four pages → Step 4: Pass + build.** **Step 5: Commit** — `git commit -m "feat: features/about/help/contact pages and contact action"`

### 🛑 REVIEW GATE 6

Present the four pages vs mockups. Sign-off before Slice 7.

---

## Slice 7 — Sign in / Sign up restyle

### Task 13: Auth two-panel restyle

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/components/auth/forms.tsx`, `src/components/auth/social-buttons.tsx`
- Test: `src/components/auth/social-buttons.test.ts`

**Interfaces:**
- Consumes: existing `configuredSocialProviders(process.env)` data already passed into `LoginForm`/`RegisterForm`; all existing actions, errors, lockout messages unchanged.
- Produces: pure helper `socialButtonsFor(providers: SocialProviderId[]): Array<{ id: "facebook" | "google"; label: string }>` (label "Continue with Facebook/Google"; unknown ids dropped). Layout = mockup two-panel (left marketing panel, spider illustration placeholder + tagline; right form card), single column mobile.

- [ ] **Step 1: Failing test** — `socialButtonsFor(["google","facebook"])` → both, that order; `socialButtonsFor(["google","apple"])` → google only; `[]` → `[]`.
- [ ] **Step 2: Fail → Step 3: Implement restyle + helper → Step 4: Pass + build.** **Step 5: Commit** — `git commit -m "feat: sign-in/sign-up two-panel restyle with env-gated social buttons"`

### 🛑 REVIEW GATE 7

Present `/login` + `/register`. Sign-off before Slice 8.

---

## Slice 8 — Rebrand sweep + SEO plumbing

### Task 14: Sweep + sitemap/icons

**Files:**
- Modify: everything matching "Spoodly Space" outside `src/content/` — logged-in UI strings, metadata, `src/lib/email-delivery.ts` + other email templates, `prisma/seed.ts` (`demo@spoodly.space` → `demo@pollysweb.com`), `README.md`, `.env.example` URL comments, `package.json` (`"name": "pollysweb"`), `src/app/robots.txt`, favicon/app icons from Task 1
- Create: `src/app/sitemap.ts`, `src/lib/rebrand-scan.ts`
- Test: `src/lib/rebrand.test.ts`

**Interfaces:**
- Produces: `scanForOldBrand(files: Array<{ path: string; text: string }>): string[]` — paths still containing "Spoodly Space", excluding allowlist `["src/app/(marketing)/about/page.tsx"]`. Sitemap: static list of the 13 marketing routes + `/login`, `/register`.

- [ ] **Step 1: Failing test** — `scanForOldBrand` over all `src/**/*.{ts,tsx}` (fs walk in test) → expect `[]`; `package.json` name === "pollysweb".
- [ ] **Step 2: Run to fail** → FAIL. **Step 3: Sweep** — mechanical replacement; metadata, email subjects/bodies, seed email + README demo-account block together, favicon/apple-touch-icon. **Step 4: Pass** + full `npm test`. **Step 5: Commit** — `git commit -m "feat: full pollys-web rebrand sweep and sitemap"`

### 🛑 REVIEW GATE 8

Quick diff review of sweep (Ted owns app UI — coordinate before this slice lands on shared files).

---

## Slice 9 — Baselines + final verification

### Task 15: Integration baselines + full verification

**Files:**
- Create: `tests/integration/public-marketing.spec.ts`
- Regenerate: `tests/integration/artifacts/baselines/**` for new pages + re-baseline login/register

**Interfaces:**
- Consumes: playwright config as-is (existing engines/viewports pattern).

- [ ] **Step 1: Write spec** — visit all 13 marketing routes + `/login` + `/register`; assert no console errors, header/footer present (shared locator), screenshot baselines per page/engine (`npm run test:integration -- --update-snapshots` after visual review).
- [ ] **Step 2: Run** `npm test && npm run lint && npm run build && npm run test:integration` — all green.
- [ ] **Step 3: Final sweep check** — `grep -rn "Spoodly Space" src/ | grep -v content/` returns only the allowlisted About mention.
- [ ] **Step 4: Commit** — `git commit -m "test: public marketing baselines and final verification"`

### 🛑 REVIEW GATE 9 — final branch review before merge consideration