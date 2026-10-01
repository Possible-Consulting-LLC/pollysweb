# Polly's Web — Public Site Redesign & Full Rebrand

**Date:** 2026-10-01
**Branch:** `feature-public-redesign`
**Status:** Design approved in conversation; awaiting spec review

## Summary

Rebuild the public-facing side of the app as **Polly's Web** (rebrand from Spoodly
Space), guided by nine mockups in `mockups/` (`public-home`, `public-features`,
`public-care-guides`, `public-pricing`, `public-about`, `public-help`,
`public-contact`, `public-legal`, `public-sign-up-in`). The round covers the
public marketing site, a content layer for blog/legal/care guides, restyled
sign-up/sign-in, and a full product rebrand. The logged-in dashboard redesign is
explicitly out of scope (separate follow-up project).

## Decisions (agreed during brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Scope | Public site only; dashboard redesign deferred |
| 2 | Header | Contact-style nav: Features · Care Guides · Blog · Pricing · About · Help · Contact, `Sign In` + `Sign Up` right, logo → `/`, no search |
| 3 | Footer | The dark-purple footer from `public-contact.png` (logo + tagline, Quick Links, Legal columns, "Stay in the Loop" newsletter, 5 social icons, © 2026 Polly's Web) used on **every** public page |
| 4 | Pricing data | Live DB plan catalog via `summarizePlanForPricing()`; **adaptive layout** if catalog differs structurally from mockup; "Coming Later" add-ons static |
| 5 | Rebrand | **Full rebrand now** — public pages + logged-in UI + emails + metadata + README |
| 6 | Art assets | Human provides exports into `public/images/…`; labeled gradient placeholders until files exist |
| 7 | OAuth buttons | Render only env-configured providers (Facebook + Google today; Apple excluded until credentials exist) |
| 8 | Legal scope | All 10 documents; missing 7 drafted for review |
| 9 | Content authoring | All content drafted: 8 care guides, 7 legal docs, 2–3 blog posts |
| 10 | Content management | Repo markdown/MDX now, **CMS-ready loaders** for blog, legal, and care guides |
| 11 | Blog | Added this round; in header nav + footer; designed by extrapolating the mockup language |
| 12 | Tagline | **"Happier, Healthier Spoods."** |
| 13 | Redirects | **None.** Site launches on a new domain; spoodlyspace.com gets domain-level redirects later (out of repo) |

## Architecture

### Route structure

```
src/app/(marketing)/
  layout.tsx              ← shared chrome: header + footer (single source)
  page.tsx                ← Home (moved from src/app/page.tsx)
  features/page.tsx
  care-guides/page.tsx
  care-guides/[slug]/page.tsx
  pricing/page.tsx
  about/page.tsx
  help/page.tsx
  contact/page.tsx
  blog/page.tsx
  blog/[slug]/page.tsx
  legal/page.tsx          ← hub (10-doc index)
  legal/[slug]/page.tsx   ← doc layout: sidebar + TOC + content
src/app/(auth)/login/     ← restyled (left marketing panel + form card)
src/app/(auth)/register/  ← same layout, Create Account
```

- Old `src/app/privacy`, `src/app/terms`, `src/app/data-deletion` pages are
  removed (their content migrates into the legal docs). **No redirects** —
  the new domain will not carry legacy paths.
- `src/app/api/facebook/data-deletion` stays (API route, not a page).
- Root `src/app/page.tsx` disappears into `(marketing)`; logged-in users
  hitting `/` keep their existing redirect into the app.
- No blog comments/search; no public site search this round.

### Shared chrome & brand

- `src/components/marketing/site-header.tsx` — logo → `/`; nav (7 items, active
  highlighting); `Sign In` + `Sign Up`; mobile hamburger drawer.
- `src/components/marketing/site-footer.tsx` — public-contact.png footer,
  identical on all pages: Quick Links column (Features, Care Guides, Blog,
  Pricing, About, Help, Contact), Legal column (9 docs), "Join Our Spood
  Community" newsletter box, socials, © 2026 Polly's Web. Script-art taglines
  in mockups ("Happier Spoods Brighter Days") render as the approved tagline:
  "Happier, Healthier Spoods."
- `src/lib/brand.ts` (exists, currently 2 logo constants) extended into the
  single brand source of truth: name, tagline ("Happier, Healthier Spoods."),
  support emails (`support@/bugs@/ideas@/partnerships@pollysweb.com`), social
  URLs, logo variants (light header + white footer + icon mark).
- Newsletter: DB table (migration) + server action, zod + existing
  `rate-limit.ts`, maintenance-mode aware, friendly duplicate handling. No
  email-provider integration this round.

### Content layer (CMS-ready)

- `src/content/blog/*.mdx`, `src/content/legal/*.mdx`, `src/content/guides/*.mdx`
  with zod-validated frontmatter (title, slug, date, excerpt, tags, cover,
  draft flag; legal docs add `group` + `lastUpdated`; guides add `category`,
  `icon`, `readingTime`).
- Typed loaders `src/lib/content/{blog,legal,care-guides}.ts`
  (`listPosts`, `getPost`, …). Pages consume loader APIs only — never the
  filesystem. Build-time cached; `draft: true` visible only in dev.
- CMS later = rewrite loader internals to DB/CMS fetches; public pages and
  URLs unchanged. Slugs/dates preserved.

### Pages

- **Home** — per mockup: rebrand announcement banner, hero, 5 feature cards,
  app preview, community CTA, value props.
- **Features / About / Help** — per their mockups (Help includes topic cards +
  FAQ accordion).
- **Care Guides** — hero, 8 category chips (Feeding, Water, Molting, Handling,
  Cleaning, Life Stages, Health, Species Profiles), 8 guide cards, "Start Here:
  Your First 3 Steps", community banner. Chips filter client-side (no URL
  state). `/care-guides/[slug]` = article layout with guide header (icon,
  category chip, reading time) + TOC.
- **Blog** — index (featured post + card grid) + post page (cover, prose,
  newsletter CTA, prev/next). Seed: rebrand welcome post + 2 starter care
  posts, originally written.
- **Legal** — per `public-legal.png`: hub page is two-column (left: doc list +
  "Questions?" contact card; right: "Our Commitment" intro + 3×3 grid of the
  9 doc cards; Overview reachable from the doc list). Doc layout: breadcrumb
  (`Legal › {title}`), left sidebar listing all docs (current highlighted),
  right "In This Article" TOC, "Last updated" date, prev/next links.
  Documents (display names per mockup, slugs kebab-case): Overview,
  Terms of Service, Privacy Policy, Cookie Policy, Community Guidelines,
  Acceptable Use Policy, Copyright & Intellectual Property, Disclaimer,
  Data Deletion, Accessibility Statement. Existing 3 migrate with content
  preserved; cookie doc enumerates actual cookies set by the app (Auth.js
  session cookie) — no invented tracking claims. Footer's Legal column links
  the 9 docs (excluding Overview).
- **Pricing** — server component; live plan catalog via
  `summarizePlanForPricing()`. Adaptive: catalog order, sensible widths for
  1–4 plans; missing active price renders "Contact us"; annual shows
  monthly-equivalent + save-% when both intervals exist. CTAs: anonymous →
  `/register`; logged-in → existing `/upgrade`; current plan → "Your current
  plan"; Free → "Start Free". Static "Coming Later" add-on cards (Breeder,
  Decorator). Billing FAQ strip matching actual billing behavior.
- **Sign up / Sign in** — mockup layout (left panel + card); provider buttons
  rendered **only** for `configuredSocialProviders()` (Facebook + Google
  today); existing server actions, errors, rate limits, and email-verification
  behavior unchanged — visual restyle only.

### Rebrand sweep

Brand strings, metadata/OG, email templates (Resend, via `email-delivery.ts`),
logged-in UI copy, README, `package.json` name, favicon/app icons,
`robots.txt`, sitemap, `.env.example` URL comments, demo seed email
(`demo@spoodly.space` → `demo@pollysweb.com`, seed + README together).
**Untouched:** env var names, DB identifiers, migration history.
The "joining the Proservability family" banner stays on Home; About carries
the rebrand story per its mockup.

### Assets (human-provided exports)

Checklist with exact filenames/sizes delivered before implementation. Files go
to `public/images/…`; missing files render labeled gradient placeholders —
swap in files, no code changes. Expected items: logo variants (light, white,
icon mark), favicon/app-icon set, OG image, hero art (home, care-guides,
features, about), sign-up panel illustration, 8 guide spot illustrations,
~3 blog covers.

## Error handling

- Unknown slugs → styled `not-found.tsx` within marketing chrome; group
  `error.tsx` also chrome-preserved.
- Loader failures fail the build (bad frontmatter = build error, not a
  broken page in prod).
- Newsletter action: zod + rate-limit + maintenance-mode + duplicate-friendly.

## Testing

Following repo conventions (colocated `*.test.ts` + Playwright baselines):

- Content loaders: frontmatter validation, draft filtering, slug lookup,
  legal group ordering.
- Pricing: pure layout logic for plan counts 1–4, missing prices, interval
  combinations; summarizePlanForPricing integration.
- Brand constants; newsletter action (validation, rate limit, duplicates).
- Playwright screenshot baselines for new pages
  (`tests/integration/artifacts/baselines/…`), existing pages re-baselined
  where chrome legitimately changes (login/register).
- `npm test`, `npm run lint`, `npm run build` green before shipping.

## Deployment notes (config, not code)

- Facebook data-deletion callback URL must be updated in Meta app settings at
  domain cutover.
- Domain-level redirects for spoodlyspace.com happen outside this repo.
- Stripe plan catalog must match the three tiers' names/prices before launch
  (admin-configured; pricing page renders whatever exists).

## Out of scope

Dashboard redesign (all mockups named `dashboard-*`), public site search,
blog comments, email-provider newsletter integration, Apple OAuth wiring,
CMS implementation (loaders only need to be swappable).