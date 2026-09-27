import { config } from 'dotenv';
// The integration suite always runs against the staging database configured in
// .env.local (same DB the app itself loads). Loaded before anything touches Prisma.
config({ path: '.env.local' });
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({ log: ['error', 'warn'] });

/** E2E data prefix — every entity this suite creates carries it, and cleanup
 * filters on it so non-prefixed staging data is never touched. */
export const PREFIX = 'ZZ-e2e-';
/** Emails are stored lowercase (registration convention); match case-insensitively. */
export const EMAIL_FRAGMENT = 'zz-e2e-';

const WINDOW_MS = 15 * 60_000;

function bucketId(scope: string, identity: string, now: number): string {
  const window = Math.floor(now / WINDOW_MS);
  return `${scope}:${createHash('sha256').update(identity).digest('hex')}:${window}`;
}

/** Frees this suite's own rate-limit windows (login + password/reauth quotas are
 * 5–10 per 15 minutes per identity — far below what an autonomous suite needs).
 * Surgical: only buckets keyed to the E2E identities are removed, plus the
 * loopback IP buckets, which on a locally-started server belong to this suite
 * alone. No other identities' windows are touched. */
export async function resetRateLimits(actorId: string, email: string): Promise<void> {
  const now = Date.now();
  const ids = ['unknown', '127.0.0.1', '::1'].flatMap(ip => [
    bucketId('password:ip', ip, now),
    bucketId('login:ip', ip, now),
  ]).concat([
    bucketId('password:account', actorId, now),
    bucketId('login:account', email.toLowerCase(), now),
  ]);
  await prisma.rateLimitBucket.deleteMany({ where: { id: { in: ids } } });
}

export function readCredsPath(): string { return 'tests/integration/artifacts/run/e2e-user.json'; }

export function readCreds(): E2eUser {
  return JSON.parse(readFileSync(readCredsPath(), 'utf8')) as E2eUser;
}

export type E2eUser = { userId: string; email: string; password: string };

/** Deletes every ZZ-e2e- entity (plans/features cascade their options,
 * translations and subscriptions; keeper users cascade their rows), plus the
 * audit/reauth/rate-limit rows this suite's actor(s) produced. Plans and
 * features are filtered by the prefix; users by the email fragment and the
 * name prefix, minus any excluded email (the seeded super_admin mid-run). */
export async function cleanupE2eData(options: { excludeEmails?: string[]; includeUsers?: boolean } = {}) {
  const { excludeEmails = [], includeUsers = false } = options;
  const deletedPlans = await prisma.plan.deleteMany({ where: { name: { startsWith: PREFIX } } });
  const deletedFeatures = await prisma.feature.deleteMany({ where: { key: { startsWith: EMAIL_FRAGMENT } } });
  let deletedUsers = 0;
  if (includeUsers) {
    const where = {
      AND: [
        { email: { contains: EMAIL_FRAGMENT, mode: 'insensitive' as const } },
        { email: { notIn: excludeEmails } },
      ],
    };
    const candidates = await prisma.user.findMany({ where, select: { id: true, role: true } });
    const ids = candidates.map(user => user.id);
    if (ids.length) {
      // Our own synthetic audit/proof/rate rows go with us; nothing else is touched.
      await prisma.adminAudit.deleteMany({ where: { actorId: { in: ids } } });
      await prisma.adminReauth.deleteMany({ where: { actorId: { in: ids } } });
      for (const { id, role } of candidates) await deleteE2eUserRow(id, role);
      deletedUsers = candidates.length;
    }
  }
  return { deletedPlans: deletedPlans.count, deletedFeatures: deletedFeatures.count, deletedUsers };
}

/** The database trigger `block_unconfirmed_user_delete` only permits a User
 * delete when the transaction sets `app.account_deletion_target` AND a
 * photos-removed AccountDeletionOperation row exists — the same gate the app's
 * own deletion flow satisfies. This mirrors that contract for the suite's own
 * synthetic rows (which carry no billing/storage artifacts), then removes the
 * operation row with the user. */
export async function deleteE2eUserRow(id: string, role: string) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.account_deletion_target', ${id}, true)`;
    const operation = await tx.accountDeletionOperation.create({ data: {
      id: randomUUID(), targetId: id, targetRole: role, stage: 'photos_removed',
      manifest: {}, spiderCount: 0, eventCount: 0, photoCount: 0, subscriptionPresent: false,
    } });
    await tx.user.delete({ where: { id } });
    await tx.accountDeletionOperation.delete({ where: { id: operation.id } });
  });
}

/** Fails loudly if any ZZ-e2e- row survived — the suite must clean up after itself. */
export async function assertNoE2eRowsLeft() {
  const [plans, features, users, subscriptions] = await Promise.all([
    prisma.plan.count({ where: { name: { startsWith: PREFIX } } }),
    prisma.feature.count({ where: { key: { startsWith: EMAIL_FRAGMENT } } }),
    prisma.user.count({ where: { email: { contains: EMAIL_FRAGMENT, mode: 'insensitive' } } }),
    prisma.userSubscription.count({
      where: { OR: [{ plan: { name: { startsWith: PREFIX } } }, { user: { email: { contains: EMAIL_FRAGMENT, mode: 'insensitive' } } }] },
    }),
  ]);
  const leftovers = { plans, features, users, subscriptions };
  const total = Object.values(leftovers).reduce((sum, count) => sum + count, 0);
  if (total > 0) throw new Error(`ZZ-e2e- rows survived cleanup: ${JSON.stringify(leftovers)}`);
  return leftovers;
}