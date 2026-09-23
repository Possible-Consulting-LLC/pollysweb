# Staging page-load performance — 2026-09-18

## Findings

- The shared logo was served as an unoptimized 1,835,816-byte PNG with `no-cache, no-store, must-revalidate`. This affected the landing page, authentication screens, application header, and favicon.
- The Home page awaited settings, spider care, recent activity, streak, and write permissions sequentially. Settings were fetched repeatedly, and the root theme lookup separately called auth and loaded the user.
- Activity loaded full care histories and photos just to populate its spider filter.
- Staging response headers identified the function region as `iad1` (Virginia), while its guarded Supabase database connection uses `us-west-2` (Oregon).

## Changes

- Use Next Image for brand logos with display-size hints; use a 256px optimized icon. Allow the public source logo to cache for one day; its URL is already versioned.
- Start Home's independent reads together; streak loading waits only on the timezone it actually needs. Parallelize settings with spider/activity reads.
- Deduplicate auth and settings within each server render request using React cache. Authentication revocation checks still run on each new request. No persistent cache of personal data was introduced.
- Load only spider ID, name, and memorial status for the Activity filter, retaining keeper scoping and existing sorting/write permissions.
- Pin staging functions to `pdx1` beside the database. This changes compute placement, not the database.

## Verification

- New regression test failed before the Home change and passes afterward. Deferred settings no longer prevent independent reads from starting.
- Full test suite: 330 passed, 0 failed.
- TypeScript and focused ESLint: passed.
- Production build using the staging project's configured `npm run build -- --webpack`: passed. The default local Turbopack build cannot bind a worker port in this environment.
- Staging image optimizer returned the 256px logo as a 33,474-byte WebP (98.2% smaller than the source).
- Focused independent code review found no actionable issues.

The signed-out landing response before changes was approximately 0.44 seconds to first byte in one sample. This is not a signed-in or controlled cold-start benchmark. Whole-page improvement must not be represented by the logo byte reduction.

## Deployment confirmation

Deployment `dpl_CTKRiFgnFGt4R83fYk9Awmjy6Ywt` completed successfully on the isolated `spoodly-space-staging` Vercel project. `https://staging.spoodlyspace.com/login` serves that deployment and reports `pdx1` in its function response header. The logo source has `public, max-age=86400`; login HTML contains optimized images and icon URLs. Browser checks confirmed the landing logos load at 96px/128px instead of fetching the full PNG, and the sign-in page logo renders correctly. No signed-in browser session was available for an end-to-end authenticated cold-load timing comparison. No database migrations, commits, or main-project deployments were performed.
