# Story photo rendering fix — 2026-09-15

User testing confirmed registration, spider creation, feeding, misting, observations, and profile photo display. Story thumbnails showed broken images.

Story used `next/image`, while the working profile/gallery used `SpoodImage`. The Next.js image configuration has no allowed remote Supabase host. Story now uses the same `SpoodImage` component with full-width/full-height styling inside its existing thumbnail container. Photo URLs, records, and lightbox behavior are unchanged.

Focused ESLint and TypeScript checks passed. No database commands or data modifications were required. Final visual confirmation requires the user's signed-in staging session.

## Lightbox layering follow-up

The user reported that later timeline cards appeared over the open image viewer. Each card's backdrop blur creates a stacking context and a containing block for fixed descendants. The shared `PhotoLightbox` now uses a React portal into `document.body`, with z-index 100 above navigation and feedback controls. This preserves existing closing, image navigation, scroll locking, and photo actions while removing the card as the overlay's positioning ancestor. Focused ESLint, TypeScript, and whitespace checks passed before staging deployment.
