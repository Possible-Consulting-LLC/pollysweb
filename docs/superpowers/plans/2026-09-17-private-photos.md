# Private Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve each uploaded photo only to the keeper who owns its exact database reference.

**Architecture:** Save internal Storage keys while preserving legacy URL references. Rewrite Storage-backed image sources to a same-origin route that checks ownership before downloading with a service-role client.

**Tech Stack:** Next.js App Router, Prisma, Supabase Storage, TypeScript, node:test.

**Spec:** `docs/superpowers/specs/2026-09-17-private-photos.md`

## Global Constraints

- Staging only; do not access production data or secrets.
- Do not run migrations, seed, or flip the bucket during implementation.
- Every private response must be `no-store`, `nosniff`, and raster-only.

---

### Task 1: Reference conversion and Storage writes

**Files:** `src/lib/photo-media.ts`, `src/lib/photo-media.test.ts`, `src/lib/uploads.ts`, `src/lib/supabase.ts`, `src/components/spoods/spood-image.tsx`.

**Interfaces:** `storageReference(path): string`, `storagePathFromReference(ref, origin): string | null`, `privatePhotoSrc(src): string`.

- [x] Add failing tests for internal keys, legacy URLs, malformed paths, and same-origin image sources; run `node --import tsx --test src/lib/photo-media.test.ts` and verify expected failures.
- [x] Implement reference helpers and update uploads, deletion, and image rendering to use them; rerun the focused tests.
- [x] Require `SUPABASE_SERVICE_ROLE_KEY` for private Storage operations.

### Task 2: Owner-checked response

**Files:** `src/lib/photo-media-route.ts`, `src/lib/photo-media-route.test.ts`, `src/app/api/photos/route.ts`.

**Interfaces:** `servePrivatePhoto(request, {userId, ownsReference, download, storageOrigin}): Promise<Response>`.

- [x] Add failing tests for anonymous, foreign, invalid, non-raster, and owned photo requests; run `node --import tsx --test src/lib/photo-media-route.test.ts` and verify expected failures.
- [x] Implement a guarded route that checks exact `Photo.url` or `Spider.profilePhoto` ownership before download; rerun tests.
- [x] Run focused lint and tests. Typecheck and the broader suite are awaiting the concurrent email-verification schema/client and test-fixture updates.

### Task 3: Staging cutover handoff

**Files:** `src/app/privacy/page.tsx`, `docs/superpowers/specs/2026-09-17-private-photos.md`.

- [ ] Update policy copy once code verification passes.
- [x] Hand parent a sequence for compatibility deploy, staging object/reference migration, private bucket flip, and verification with two accounts.
