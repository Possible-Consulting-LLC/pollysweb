import { config } from 'dotenv';
config({ path: '.env.local' });
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { hashNewPassword } from '../../src/lib/password-policy';
import { prisma, cleanupE2eData, assertNoE2eRowsLeft, deleteE2eUserRow, type E2eUser } from './lib/db';

/**
 * Fully autonomous auth seeding (no human participation, no shared credentials):
 * creates a dedicated super_admin row directly in the staging database, with a
 * suite-generated random password that only this suite ever knows. The row
 * satisfies every check in `readActor` (src/lib/admin/actor.ts):
 *   role 'super_admin', emailVerified set, isDemo false, suspendedAt/deletingAt
 *   null, passwordHash present — and it is NOT the protected owner; the
 *   pre-existing ADMIN_OWNER_ID/protectedOwner binding stays untouched and is
 *   only verified to exist so the actor checks can pass.
 * The suite then signs in through the real /login UI (auth.setup.ts) and
 * performs the real reauth flow at /admin/reauth when withAdminControl requires it.
 */

const CREDENTIALS_PATH = 'tests/integration/artifacts/run/e2e-user.json';

function requireBinding() {
  const ownerId = process.env.ADMIN_OWNER_ID;
  if (!ownerId) throw new Error('ADMIN_OWNER_ID is not set in .env.local — cannot verify the protected-owner binding.');
  return ownerId;
}

export default async function globalSetup() {
  const ownerId = requireBinding();
  const binding = await prisma.protectedOwner.findUnique({
    where: { id: 1 }, include: { user: { select: { email: true, role: true } } },
  });
  if (!binding || binding.userId !== ownerId || binding.user?.role !== 'super_admin') {
    throw new Error('The ADMIN_OWNER_ID/protectedOwner binding is missing or does not match — the actor checks would fail closed.');
  }

  // Sweep leftovers from any earlier aborted run before seeding.
  await cleanupE2eData({ includeUsers: true });

  const password = randomBytes(24).toString('base64url'); // ≥ 6 chars (login schema), suite-only
  const email = `zz-e2e-admin-${Date.now()}-${randomBytes(3).toString('hex')}@e2e.example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      emailVerified: new Date(),
      name: 'ZZ-e2e Admin',
      passwordHash: await hashNewPassword(password),
      role: 'super_admin',
      isDemo: false,
    },
    select: { id: true },
  });
  mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({ userId: user.id, email, password } satisfies E2eUser));

  return async function globalTeardown() {
    try {
      // The seeded super_admin itself is only deleted here (mid-run cleanups
      // exclude its email so the session stays alive through the whole run).
      const credsPath = CREDENTIALS_PATH;
      if (existsSync(credsPath)) {
        const creds = JSON.parse(readFileSync(credsPath, 'utf8')) as E2eUser;
        await prisma.adminAudit.deleteMany({ where: { actorId: creds.userId } });
        await prisma.adminReauth.deleteMany({ where: { actorId: creds.userId } });
        await deleteE2eUserRow(creds.userId, 'super_admin');
      }
      // The suite's own success criterion: nothing prefixed survives.
      await assertNoE2eRowsLeft();
    } finally {
      await prisma.$disconnect();
    }
  };
}