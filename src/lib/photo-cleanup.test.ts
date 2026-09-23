import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPhotoCleanupService, detachPhotoRecord, type DetachPhotoTransaction, type PhotoCleanupTransaction } from './photo-cleanup';

test('ordinary photo cleanup has a durable reference-safe service boundary', async () => {
  const loaded = await import('./photo-cleanup').catch(() => null);
  assert.ok(loaded && typeof loaded.createPhotoCleanupService === 'function');
});

type Ledger = { key: string; userId: string; settled: boolean };

function fixture(options: { referenced?: boolean; mixedReference?: boolean; removalFails?: boolean; databaseFails?: boolean; ledger?: Ledger } = {}) {
  let ledger = options.ledger ?? null;
  let removed = false;
  let capturedWhere: unknown;
  const tx = {
    ownedUpload: {
      findUnique: async ({ where }: { where: { key: string } }) => ledger?.key === where.key ? ledger : null,
      createMany: async ({ data }: { data: Ledger[] }) => {
        if (ledger) return { count: 0 };
        ledger = data[0];
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { key: string; userId: string; settled: boolean } }) => {
        const count = ledger?.key === where.key && ledger.userId === where.userId && ledger.settled === where.settled ? 1 : 0;
        if (count) ledger = null;
        return { count };
      },
    },
    spider: {
      findFirst: async ({ where }: { where: unknown }) => {
        capturedWhere = where;
        const mixed = JSON.stringify(where).includes('https://storage.example/storage/v1/object/public/spoods/spider/photo.webp');
        return options.referenced || (options.mixedReference && mixed) ? { id: 'spider' } : null;
      },
    },
  };
  const service = createPhotoCleanupService({
    keyFromReference: (reference: string) => reference.startsWith('spood-storage:') ? reference.slice('spood-storage:'.length) : null,
    referenceVariants: (key: string) => ({
      exact: [`spood-storage:${key}`],
      prefixes: [
        `https://storage.example/storage/v1/object/public/spoods/${key}`,
        `https://storage.example/storage/v1/object/sign/spoods/${key}`,
      ],
    }),
    withLocked: async <T>(_userId: string, work: (value: PhotoCleanupTransaction) => Promise<T>) => {
      if (options.databaseFails) throw new Error('database unavailable');
      return work(tx as unknown as PhotoCleanupTransaction);
    },
    remove: async (key: string) => {
      assert.equal(key, 'spider/photo.webp');
      if (options.removalFails) throw new Error('storage unavailable');
      removed = true;
    },
  });
  return { service, tx, get ledger() { return ledger; }, get removed() { return removed; }, get capturedWhere() { return capturedWhere; } };
}

test('preparation durably claims a legacy object but never takes another keeper’s ledger', async () => {
  const legacy = fixture();
  assert.equal(await legacy.service.prepare(legacy.tx, 'spood-storage:spider/photo.webp', 'keeper', ['keeper', 'spider']), true);
  assert.deepEqual(legacy.ledger, { key: 'spider/photo.webp', userId: 'keeper', settled: true });

  const foreign = fixture({ ledger: { key: 'spider/photo.webp', userId: 'other', settled: true } });
  assert.equal(await foreign.service.prepare(foreign.tx, 'spood-storage:spider/photo.webp', 'keeper', ['keeper', 'spider']), false);
  assert.equal(foreign.ledger?.userId, 'other');
});

test('preparation cannot claim a legacy object outside the keeper or spood namespace', async () => {
  const f = fixture();
  assert.equal(await f.service.prepare(f.tx, 'spood-storage:other/photo.webp', 'keeper', ['keeper', 'spider']), false);
  assert.equal(f.ledger, null);
});

test('cleanup retains a referenced object and checks every relational photo field', async () => {
  const f = fixture({ referenced: true, ledger: { key: 'spider/photo.webp', userId: 'keeper', settled: true } });
  assert.equal(await f.service.cleanup('spood-storage:spider/photo.webp', 'keeper'), 'referenced');
  assert.equal(f.removed, false);
  assert.ok(f.ledger);
  const query = JSON.stringify(f.capturedWhere);
  for (const field of ['profilePhoto', 'photos', 'enclosure', 'feedings', 'molts', 'observations']) assert.match(query, new RegExp(field));
});

test('cleanup treats public and signed URL forms as the same live storage object', async () => {
  const f = fixture({ mixedReference: true, ledger: { key: 'spider/photo.webp', userId: 'keeper', settled: true } });
  assert.equal(await f.service.cleanup('spood-storage:spider/photo.webp', 'keeper'), 'referenced');
  assert.equal(f.removed, false);
  assert.ok(f.ledger);
});

test('cleanup reports pending and retains the durable ledger when storage removal fails', async () => {
  const f = fixture({ removalFails: true, ledger: { key: 'spider/photo.webp', userId: 'keeper', settled: true } });
  assert.equal(await f.service.cleanup('spood-storage:spider/photo.webp', 'keeper'), 'pending');
  assert.ok(f.ledger);
  assert.equal(f.removed, false);
});

test('cleanup reports pending when its locked database check is unavailable', async () => {
  const f = fixture({ databaseFails: true, ledger: { key: 'spider/photo.webp', userId: 'keeper', settled: true } });
  assert.equal(await f.service.cleanup('spood-storage:spider/photo.webp', 'keeper'), 'pending');
  assert.ok(f.ledger);
});

test('cleanup removes the ledger only after the provider confirms object removal', async () => {
  const f = fixture({ ledger: { key: 'spider/photo.webp', userId: 'keeper', settled: true } });
  assert.equal(await f.service.cleanup('spood-storage:spider/photo.webp', 'keeper'), 'removed');
  assert.equal(f.removed, true);
  assert.equal(f.ledger, null);
});

test('photo detachment rereads the current profile reference under the write lock', async () => {
  let deleted = false;
  let profilePhoto = 'spood-storage:spider/photo.webp';
  const tx = {
    photo: {
      findFirst: async ({ where }: { where: { id?: string } }) => where.id ? ({ id: 'photo', url: profilePhoto, spiderId: 'spider' }) : null,
      delete: async () => { deleted = true; },
      findFirstOrThrow: undefined,
    },
    spider: {
      findUniqueOrThrow: async () => ({ profilePhoto }),
      update: async ({ data }: { data: { profilePhoto: string } }) => { profilePhoto = data.profilePhoto; },
    },
  };
  const result = await detachPhotoRecord(
    tx as unknown as DetachPhotoTransaction,
    { photoId: 'photo', spiderId: 'spider', userId: 'keeper' },
    async () => true,
  );
  assert.equal(deleted, true);
  assert.equal(profilePhoto, '/spoods/defaults/star.svg');
  assert.deepEqual(result, { url: 'spood-storage:spider/photo.webp', cleanupPrepared: true });
});

test('both user photo deletion actions use durable detachment and truthful pending cleanup copy', () => {
  for (const relative of ['../app/actions/care-habitat.ts', '../app/actions/activity.ts']) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /detachStoredPhotoRecord/);
    assert.match(source, /cleanupDetachedPhoto/);
    assert.match(source, /storage cleanup is pending and has been recorded/i);
    assert.doesNotMatch(source, /deleteStoredImage/);
  }
});
