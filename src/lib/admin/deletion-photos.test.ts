import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Prisma } from '@prisma/client';
import { discoverDeletionPhotoPage, initialDeletionPhotoManifest, parseDeletionPhotoManifest, PHOTO_DISCOVERY_PAGE_SIZE } from './deletion-photos';

test('candidate discovery covers every photo field and bounds foreign-reference queries', () => {
  const source = fs.readFileSync(new URL('./deletion-photos.ts', import.meta.url), 'utf8');
  for (const field of ['image', 'profilePhoto', 'url', 'photo', 'photoUrl', 'moltPhoto', 'postMoltPhoto']) assert.match(source, new RegExp(field));
  assert.match(source, /userId: \{ not: targetId \}/);
  assert.match(source, /start \+= PHOTO_DISCOVERY_PAGE_SIZE/);
  assert.match(source, /take: PHOTO_DISCOVERY_PAGE_SIZE/);
  assert.doesNotMatch(source, /deletionPhotoSnapshot/);
  const foreignSection = source.slice(source.indexOf('async function foreignSharedKeys'), source.indexOf('type Candidate'));
  assert.doesNotMatch(foreignSection, /\.findMany\(/, 'foreign checks must return at most one row per candidate key');
  assert.match(foreignSection, /\.findFirst\(/);
});

test('ledger discovery preserves former-spider ownership while excluding shared and unsafe keys', async () => {
  const empty = { findMany: async () => [], findFirst: async () => null };
  const targetRows = [{ key: 'former-spider/owned.jpg' }, { key: 'former-spider/shared.jpg' }, { key: 'former-spider/../unsafe.jpg' }];
  const tx = {
    user: empty,
    spider: { findMany: async () => [], findFirst: async ({ where }: { where: unknown }) => JSON.stringify(where).includes('former-spider/shared.jpg') ? { id: 'foreign-spider' } : null },
    enclosure: empty, feedingEvent: empty, moltEvent: empty, observationEvent: empty, photo: empty,
    ownedUpload: {
      findMany: async ({ where }: { where: { userId: string | { not: string } } }) => typeof where.userId === 'string' ? targetRows : [],
      findFirst: async () => null,
    },
  };
  const next = await discoverDeletionPhotoPage(tx as unknown as Prisma.TransactionClient, 'target', 'https://own.example', { ...initialDeletionPhotoManifest(), source: 7 });
  assert.deepEqual(next.keys, ['former-spider/owned.jpg']);
});

test('account deletion discovery persists a fixed-size page instead of loading the complete history', async () => {
  const pages: Array<Record<string, unknown>> = [];
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: `photo-${String(index).padStart(3, '0')}`, url: `spood-storage:spider-${index}/photo.webp`, spiderId: `spider-${index}` }));
  const empty = { findMany: async (args: Record<string, unknown>) => { pages.push(args); return []; }, findFirst: async () => null };
  const tx = {
    user: empty, spider: empty,
    photo: { findMany: async (args: { take?: number; where?: { spider?: { userId?: unknown } } }) => { pages.push(args as unknown as Record<string, unknown>); if (args.where?.spider?.userId && typeof args.where.spider.userId === 'object') return []; return rows.slice(0, args.take ?? 0); } },
    enclosure: empty, feedingEvent: empty, moltEvent: empty, observationEvent: empty, ownedUpload: empty,
  };
  const next = await discoverDeletionPhotoPage(tx as unknown as Prisma.TransactionClient, 'target', 'https://own.example', { ...initialDeletionPhotoManifest(), source: 2 });
  assert.equal(next.keys.length, PHOTO_DISCOVERY_PAGE_SIZE);
  assert.equal(next.cursor, `photo-${String(PHOTO_DISCOVERY_PAGE_SIZE - 1).padStart(3, '0')}`);
  assert.equal(next.complete, false);
  assert.ok(pages.every(page => !('take' in page) || Number(page.take) <= PHOTO_DISCOVERY_PAGE_SIZE));
  assert.ok(!JSON.stringify(pages).includes('photo-099'), 'later history must remain for a later resumable page');
});

test('legacy array manifests remain completed discovery receipts', () => {
  assert.deepEqual(parseDeletionPhotoManifest(['target/a.jpg']).keys, ['target/a.jpg']);
  assert.equal(parseDeletionPhotoManifest(['target/a.jpg']).complete, true);
});
