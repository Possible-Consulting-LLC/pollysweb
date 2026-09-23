import type { Prisma } from '@prisma/client';
import { storagePathFromReference, storageReference } from '../photo-media';

export const PHOTO_DISCOVERY_PAGE_SIZE = 20;
const PHOTO_DISCOVERY_SOURCE_COUNT = 8;
export type DeletionPhotoManifest = {
  version: 1;
  keys: string[];
  source: number;
  cursor: string | null;
  complete: boolean;
};

export const initialDeletionPhotoManifest = (): DeletionPhotoManifest => ({
  version: 1,
  keys: [],
  source: 0,
  cursor: null,
  complete: false,
});

export function parseDeletionPhotoManifest(value: unknown): DeletionPhotoManifest {
  if (Array.isArray(value)) return { version: 1, keys: value.filter((key): key is string => typeof key === 'string'), source: PHOTO_DISCOVERY_SOURCE_COUNT, cursor: null, complete: true };
  if (value && typeof value === 'object') {
    const input = value as Partial<DeletionPhotoManifest>;
    if (input.version === 1 && Array.isArray(input.keys)) return {
      version: 1,
      keys: input.keys.filter((key): key is string => typeof key === 'string'),
      source: Number.isInteger(input.source) ? Math.max(0, Math.min(PHOTO_DISCOVERY_SOURCE_COUNT, Number(input.source))) : 0,
      cursor: typeof input.cursor === 'string' ? input.cursor : null,
      complete: input.complete === true,
    };
  }
  return initialDeletionPhotoManifest();
}

function pageWhere(cursor: string | null) {
  return cursor ? { id: { gt: cursor } } : {};
}

function keyPageWhere(cursor: string | null) {
  return cursor ? { key: { gt: cursor } } : {};
}

async function foreignSharedKeys(
  tx: Prisma.TransactionClient,
  targetId: string,
  origin: string,
  keys: string[],
): Promise<Set<string>> {
  const shared = new Set<string>();
  for (let start = 0; start < keys.length; start += PHOTO_DISCOVERY_PAGE_SIZE) {
    const chunk = keys.slice(start, start + PHOTO_DISCOVERY_PAGE_SIZE);
    const references = (field: string, key: string) => [
      { [field]: storageReference(key) },
      { [field]: { startsWith: `${origin}/storage/v1/object/public/spoods/${key}` } },
      { [field]: { startsWith: `${origin}/storage/v1/object/sign/spoods/${key}` } },
    ];
    const checks = chunk.map(async key => {
      const [user, spider, upload] = await Promise.all([
        tx.user.findFirst({
          where: { id: { not: targetId }, OR: references('image', key) as Prisma.UserWhereInput[] },
          select: { id: true },
        }),
        tx.spider.findFirst({
          where: {
            userId: { not: targetId },
            OR: [
              ...references('profilePhoto', key),
              { photos: { some: { OR: references('url', key) } } },
              { enclosure: { is: { OR: references('photo', key) } } },
              { feedings: { some: { OR: references('photoUrl', key) } } },
              { molts: { some: { OR: [...references('moltPhoto', key), ...references('postMoltPhoto', key)] } } },
              { observations: { some: { OR: references('photoUrl', key) } } },
            ] as Prisma.SpiderWhereInput[],
          },
          select: { id: true },
        }),
        tx.ownedUpload.findFirst({
          where: { userId: { not: targetId }, key },
          select: { key: true },
        }),
      ]);
      if (user || spider || upload) shared.add(key);
    });
    await Promise.all(checks);
  }
  return shared;
}

type Candidate = { ref: string | null; prefix?: string; ledger?: boolean };

/** Process at most one fixed-size owned page. Empty sources may be skipped in
 * the same call; every non-empty page persists a cursor before another page. */
export async function discoverDeletionPhotoPage(
  tx: Prisma.TransactionClient,
  targetId: string,
  origin: string,
  input: DeletionPhotoManifest,
): Promise<DeletionPhotoManifest> {
  const state = parseDeletionPhotoManifest(input);
  if (state.complete) return state;
  while (state.source < PHOTO_DISCOVERY_SOURCE_COUNT) {
    let rows: Array<Record<string, unknown>> = [];
    let candidates: Candidate[] = [];
    if (state.source === 0) {
      rows = state.cursor ? [] : await tx.user.findMany({ where: { id: targetId }, take: 1, orderBy: { id: 'asc' }, select: { id: true, image: true } });
      candidates = rows.map(row => ({ ref: row.image as string | null, prefix: targetId }));
    } else if (state.source === 1) {
      rows = await tx.spider.findMany({ where: { userId: targetId, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, profilePhoto: true } });
      candidates = rows.map(row => ({ ref: row.profilePhoto as string | null, prefix: row.id as string }));
    } else if (state.source === 2) {
      rows = await tx.photo.findMany({ where: { spider: { userId: targetId }, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, url: true, spiderId: true } });
      candidates = rows.map(row => ({ ref: row.url as string, prefix: row.spiderId as string }));
    } else if (state.source === 3) {
      rows = await tx.enclosure.findMany({ where: { spider: { userId: targetId }, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, photo: true, spiderId: true } });
      candidates = rows.map(row => ({ ref: row.photo as string | null, prefix: row.spiderId as string }));
    } else if (state.source === 4) {
      rows = await tx.feedingEvent.findMany({ where: { spider: { userId: targetId }, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, photoUrl: true, spiderId: true } });
      candidates = rows.map(row => ({ ref: row.photoUrl as string | null, prefix: row.spiderId as string }));
    } else if (state.source === 5) {
      rows = await tx.moltEvent.findMany({ where: { spider: { userId: targetId }, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, moltPhoto: true, postMoltPhoto: true, spiderId: true } });
      candidates = rows.flatMap(row => [{ ref: row.moltPhoto as string | null, prefix: row.spiderId as string }, { ref: row.postMoltPhoto as string | null, prefix: row.spiderId as string }]);
    } else if (state.source === 6) {
      rows = await tx.observationEvent.findMany({ where: { spider: { userId: targetId }, ...pageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { id: 'asc' }, select: { id: true, photoUrl: true, spiderId: true } });
      candidates = rows.map(row => ({ ref: row.photoUrl as string | null, prefix: row.spiderId as string }));
    } else {
      rows = await tx.ownedUpload.findMany({ where: { userId: targetId, ...keyPageWhere(state.cursor) }, take: PHOTO_DISCOVERY_PAGE_SIZE, orderBy: { key: 'asc' }, select: { key: true } });
      candidates = rows.map(row => ({ ref: storageReference(row.key as string), ledger: true }));
    }

    for (const candidate of candidates) if (candidate.ref?.startsWith('/uploads/')) throw new Error('Local development photos require separate cleanup before account deletion');
    const pageKeys = [...new Set(candidates.flatMap(candidate => {
      const key = candidate.ref ? storagePathFromReference(candidate.ref, origin) : null;
      if (!key) return [];
      const prefix = key.split('/')[0];
      return candidate.ledger || prefix === targetId || prefix === candidate.prefix ? [key] : [];
    }))];
    const shared = await foreignSharedKeys(tx, targetId, origin, pageKeys);
    const keys = [...new Set([...state.keys, ...pageKeys.filter(key => !shared.has(key))])].sort();
    const pageLimit = state.source === 0 ? 1 : PHOTO_DISCOVERY_PAGE_SIZE;
    const cursorField = state.source === 7 ? 'key' : 'id';
    if (rows.length < pageLimit) {
      state.source += 1;
      state.cursor = null;
    } else {
      state.cursor = String(rows[rows.length - 1][cursorField]);
    }
    state.keys = keys;
    if (rows.length > 0) return state;
  }
  state.complete = true;
  state.cursor = null;
  return state;
}
