# Deletion Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary photo removal reference-safe and durable, and make account-deletion photo discovery bounded and resumable from its first database mutation.

**Architecture:** Reuse `OwnedUpload` as the durable cleanup ledger for ordinary deletions, checking all relational references under the keeper lock before deleting a storage object. Store bounded account-deletion discovery progress inside the existing JSON manifest so the deletion receipt and access block exist before scanning a large account; each resume processes a fixed-size page and persists its cursor.

**Tech Stack:** Next.js server actions, Prisma/PostgreSQL, Supabase Storage, Node test runner.

**Spec:** Production-readiness review reported September 23, 2026.

## Global Constraints

- Work only in the isolated staging worktree.
- Do not access any database, run seeds/resets, commit, push, deploy, or access production.
- Preserve exact actor/target authorization, maintenance gates, and protected-owner constraints.
- Follow RED → GREEN for each behavior change.

## Review Focus

- A deleted album row must not remove an object still referenced by any profile, enclosure, feeding, molt, observation, or other album row.
- Concurrent profile selection must be resolved from data reread under the keeper lock.
- Storage failure must retain a durable cleanup record and produce truthful pending-cleanup messaging.
- Account deletion must create its receipt/access block before candidate discovery and must persist bounded progress.
- Candidate and foreign-reference queries must have fixed-size key/page bounds.

## Task 1: Reference-safe ordinary photo cleanup

- [x] Add failing tests for referenced objects, storage failure, successful cleanup, and current profile reread.
- [x] Run the focused tests and confirm the expected failures.
- [x] Implement durable cleanup helpers using `OwnedUpload` and relational reference checks.
- [x] Route both album and activity deletion through the helper and return pending-cleanup copy when appropriate.
- [x] Run the focused tests to green.

## Task 2: Bounded, resumable account-deletion discovery

- [x] Add failing tests proving the receipt is created with discovery state before scanning and every query page/key set is bounded.
- [x] Run the focused tests and confirm the expected failures.
- [x] Add a versioned JSON manifest format with backward compatibility for existing array manifests.
- [x] Persist one bounded discovery page per resume step, including foreign-reference filtering.
- [x] Replace preview discovery with bounded count-only impact estimates.
- [x] Run the focused tests to green.

## Task 3: Verification

- [x] Run all deletion, upload, maintenance, and authorization tests.
- [x] Run the complete test suite, TypeScript, scoped ESLint, `git diff --check`, and production build.
- [x] Review the final diff for authorization, data-loss, query-bound, and truthful-status regressions.
- [x] Update the staging handoff with the implementation and verification evidence.
