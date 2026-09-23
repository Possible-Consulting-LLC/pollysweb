import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRequestSession } from '@/lib/raw-session';
import { mutationIdentity } from '../mutation-context';
import { matchesCredentialFingerprint, userCredentialSource } from '../credential-version';
import type { RequestIdentity } from './test-session';
import { assertSiteAccess, MaintenanceError, maintenanceMode } from './maintenance-policy';
import { readMaintenanceState } from './maintenance-state';
const actorSelect = {
  id: true, role: true, isDemo: true, emailVerified: true, suspendedAt: true, deletingAt: true,
  passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true
} as const;
async function liveSuperAdmin(db: Prisma.TransactionClient, id: string) {
  const ownerId = process.env.ADMIN_OWNER_ID;
  if (!ownerId)
    return null;
  const binding = await db.protectedOwner.findUnique({ where: { id: 1 }, include: { user: { select: actorSelect } } });
  const valid = (user: Prisma.UserGetPayload<{
    select: typeof actorSelect;
  }> | null | undefined) => !!user && user.role === 'super_admin' && !user.isDemo && !!user.emailVerified && !user.suspendedAt && !user.deletingAt;
  if (binding?.userId !== ownerId || !valid(binding?.user))
    return null;
  const user = await db.user.findUnique({ where: { id }, select: actorSelect });
  return valid(user) ? user : null;
}
/** Credentials have already been verified by Auth.js before this login gate.
 * It must not resolve a session (which would recursively invoke Auth.js). */
export async function allowMaintenanceLogin(userId: string | undefined, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  try {
    if (maintenanceMode(await readMaintenanceState(db), new Date()) !== 'active')
      return true;
    return !!userId && !!await liveSuperAdmin(db, userId);
  }
  catch {
    return false;
  }
}
type CredentialChange = {
  actorId: string;
  source: string;
};
const credentialChanges = new WeakMap<Prisma.TransactionClient, CredentialChange>();
async function canBypass(db: Prisma.TransactionClient, identity: RequestIdentity | null, change?: CredentialChange) {
  const session = await getRequestSession();
  const id = session?.user?.id;
  if (!id || (identity && identity.actorId !== id))
    return false;
  const actor = await liveSuperAdmin(db, id);
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!actor || !secret || !matchesCredentialFingerprint(session?.user?.credentialVersion, change?.actorId === id ? change.source : userCredentialSource(actor), secret))
    return false;
  if (identity?.testSessionId) {
    const row = await db.adminTestSession.findUnique({ where: { id: identity.testSessionId } });
    if (!row || row.endedAt || row.actorId !== id || row.targetId !== identity.effectiveUserId || row.credentialVersion !== session!.user!.credentialVersion || row.expiresAt.getTime() <= Date.now() || row.expiresAt.getTime() - row.createdAt.getTime() > 3600000)
      return false;
    const target = await db.user.findUnique({ where: { id: row.targetId }, select: actorSelect });
    if (!target?.isDemo || target.role !== 'user' || !target.emailVerified || target.suspendedAt || target.deletingAt)
      return false;
  }
  return true;
}
/** Live server-only proof for UI context. The public status DTO never carries this. */
export async function hasMaintenanceBypass(identity: RequestIdentity | null, db: Prisma.TransactionClient = prisma): Promise<boolean> {
  if (!identity) return false;
  try { return await canBypass(db, identity); } catch { return false; }
}
/** Read state and live bypass on the caller's connection, including inside transactions. */
export async function guardMaintenance(operation: 'read' | 'write', identity: RequestIdentity | null = mutationIdentity.getStore()?.identity ?? null, db: Prisma.TransactionClient = prisma): Promise<void> {
  try {
    const state = await readMaintenanceState(db);
    await assertSiteAccess(identity, state, new Date(), operation, () => canBypass(db, identity));
  }
  catch {
    throw new MaintenanceError();
  }
}
/** Signed service callbacks/cron have no human actor or maintenance bypass. */
export async function guardServiceMaintenance(db: Prisma.TransactionClient = prisma) {
  await assertSiteAccess(null, await readMaintenanceState(db), new Date(), 'write');
}
/** Call immediately before rotating the current actor's credential inside a
 * maintenanceTransaction. The User lock prevents an unrelated revocation from
 * being mistaken for this transaction's own change. Proof never leaves this module. */
export async function prepareCredentialChange(db: Prisma.TransactionClient, userId: string): Promise<void> {
  const session = await getRequestSession();
  await db.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  if (session?.user?.id !== userId) return;
  await guardMaintenance('write', undefined, db);
  const actor = await db.user.findUnique({ where: { id: userId }, select: actorSelect });
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!actor || !secret || !matchesCredentialFingerprint(session.user.credentialVersion, userCredentialSource(actor), secret))
    throw new MaintenanceError();
  credentialChanges.set(db, { actorId: userId, source: userCredentialSource(actor) });
}
export async function guardMaintenanceAfterWrite(db: Prisma.TransactionClient): Promise<void> {
  const change = credentialChanges.get(db);
  try {
    await assertSiteAccess(mutationIdentity.getStore()?.identity ?? null, await readMaintenanceState(db), new Date(), 'write', () => canBypass(db, mutationIdentity.getStore()?.identity ?? null, change));
  }
  catch {
    throw new MaintenanceError();
  }
  finally {
    credentialChanges.delete(db);
  }
}
