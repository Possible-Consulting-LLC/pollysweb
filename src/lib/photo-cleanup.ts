export type PhotoCleanupResult = 'removed' | 'referenced' | 'pending' | 'not-owned';

type LedgerRow = { key: string; userId: string; settled: boolean };
export type PhotoCleanupTransaction = {
  ownedUpload: {
    findUnique(args: { where: { key: string }; select?: { key: true; userId: true; settled: true } }): PromiseLike<LedgerRow | null>;
    createMany(args: { data: LedgerRow[]; skipDuplicates: true }): PromiseLike<{ count: number }>;
    deleteMany(args: { where: { key: string; userId: string; settled: true } }): PromiseLike<{ count: number }>;
  };
  spider: {
    findFirst(args: { where: Record<string, unknown>; select: { id: true } }): PromiseLike<{ id: string } | null>;
  };
};

type PhotoCleanupDependencies = {
  keyFromReference(reference: string): string | null;
  referenceVariants(key: string): { exact: string[]; prefixes: string[] };
  withLocked<T>(userId: string, work: (tx: PhotoCleanupTransaction) => Promise<T>): Promise<T>;
  remove(key: string): Promise<void>;
};

function fieldReferences(field: string, variants: { exact: string[]; prefixes: string[] }) {
  return [
    ...variants.exact.map(reference => ({ [field]: reference })),
    ...variants.prefixes.map(prefix => ({ [field]: { startsWith: prefix } })),
  ];
}

function referenceWhere(variants: { exact: string[]; prefixes: string[] }) {
  return {
    OR: [
      ...fieldReferences('profilePhoto', variants),
      { photos: { some: { OR: fieldReferences('url', variants) } } },
      { enclosure: { is: { OR: fieldReferences('photo', variants) } } },
      { feedings: { some: { OR: fieldReferences('photoUrl', variants) } } },
      { molts: { some: { OR: [...fieldReferences('moltPhoto', variants), ...fieldReferences('postMoltPhoto', variants)] } } },
      { observations: { some: { OR: fieldReferences('photoUrl', variants) } } },
    ],
  };
}

export function createPhotoCleanupService(deps: PhotoCleanupDependencies) {
  async function prepare(tx: PhotoCleanupTransaction, reference: string, userId: string, allowedPrefixes: readonly string[]): Promise<boolean> {
    const key = deps.keyFromReference(reference);
    if (!key) return false;
    const existing = await tx.ownedUpload.findUnique({ where: { key }, select: { key: true, userId: true, settled: true } });
    if (existing) return existing.userId === userId && existing.settled;
    if (!allowedPrefixes.includes(key.split('/')[0])) return false;
    await tx.ownedUpload.createMany({
      data: [{ key, userId, settled: true }],
      skipDuplicates: true,
    });
    const ledger = await tx.ownedUpload.findUnique({ where: { key }, select: { key: true, userId: true, settled: true } });
    return ledger?.userId === userId && ledger.settled;
  }

  async function cleanup(reference: string, userId: string): Promise<PhotoCleanupResult> {
    const key = deps.keyFromReference(reference);
    if (!key) return 'not-owned';
    try {
      return await deps.withLocked(userId, async tx => {
        const ledger = await tx.ownedUpload.findUnique({ where: { key }, select: { key: true, userId: true, settled: true } });
        if (!ledger || ledger.userId !== userId || !ledger.settled) return 'not-owned';
        const referenced = await tx.spider.findFirst({ where: referenceWhere(deps.referenceVariants(key)), select: { id: true } });
        if (referenced) return 'referenced';
        try {
          await deps.remove(key);
        } catch {
          return 'pending';
        }
        const removed = await tx.ownedUpload.deleteMany({ where: { key, userId, settled: true } });
        return removed.count === 1 ? 'removed' : 'pending';
      });
    } catch {
      return 'pending';
    }
  }

  return { prepare, cleanup };
}

export type DetachPhotoTransaction = PhotoCleanupTransaction & {
  photo: {
    findFirst(args: Record<string, unknown>): PromiseLike<{ id: string; url: string; spiderId: string } | null>;
    delete(args: { where: { id: string } }): PromiseLike<unknown>;
  };
  spider: PhotoCleanupTransaction['spider'] & {
    findUniqueOrThrow(args: Record<string, unknown>): PromiseLike<{ profilePhoto: string | null }>;
    update(args: { where: { id: string }; data: { profilePhoto: string } }): PromiseLike<unknown>;
  };
};

/** Detach the exact album row and repair the current profile pointer using rows
 * reread inside the already keeper-locked write transaction. */
export async function detachPhotoRecord(
  tx: DetachPhotoTransaction,
  input: { photoId: string; spiderId: string; userId: string },
  prepare: (tx: PhotoCleanupTransaction, reference: string, userId: string, allowedPrefixes: readonly string[]) => Promise<boolean>,
): Promise<{ url: string; cleanupPrepared: boolean }> {
  const photo = await tx.photo.findFirst({
    where: { id: input.photoId, spiderId: input.spiderId },
    select: { id: true, url: true, spiderId: true },
  });
  if (!photo) throw new Error('Photo not found.');
  const cleanupPrepared = await prepare(tx, photo.url, input.userId, [input.userId, input.spiderId]);
  const spider = await tx.spider.findUniqueOrThrow({ where: { id: input.spiderId }, select: { profilePhoto: true } });
  await tx.photo.delete({ where: { id: photo.id } });
  if (spider.profilePhoto === photo.url) {
    const fallback = await tx.photo.findFirst({
      where: { spiderId: input.spiderId },
      orderBy: { takenAt: 'desc' },
      select: { url: true },
    });
    await tx.spider.update({
      where: { id: input.spiderId },
      data: { profilePhoto: fallback?.url ?? '/spoods/defaults/star.svg' },
    });
  }
  return { url: photo.url, cleanupPrepared };
}
