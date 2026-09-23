import 'server-only';
import { guardMaintenance } from './maintenance-access';
import { MaintenanceError } from './maintenance-policy';
import type { Prisma } from '@prisma/client';
import { readAdminProof } from './reauth-store';
import { requireRecentAdminAuth } from './reauth';
import { prisma } from '@/lib/db';
import { getRequestSession } from '@/lib/raw-session';
import { denyTestContext } from './test-session-store';
import { matchesCredentialFingerprint, userCredentialSource } from '../credential-version';
import { canManage, type Actor, type AdminOperation, type Target } from './policy';

export class AdminAccessError extends Error {
  constructor() { super('Administrator access denied.'); this.name = 'AdminAccessError'; }
}
const deny = (): never => { throw new AdminAccessError(); };
type SessionIdentity = { id?: string | null; credentialVersion?: string } | undefined;
type Database = Pick<Prisma.TransactionClient, 'user' | 'protectedOwner' | 'adminReauth'>;
const actorSelect = {
  id: true, role: true, isDemo: true, emailVerified: true, suspendedAt: true, deletingAt: true,
  passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true,
} as const;

async function readActor(db: Database, identity: SessionIdentity, minimum: 'admin' | 'super_admin') {
  if (!identity?.id || !['admin', 'super_admin'].includes(minimum)) return deny();
  const configuredOwner = process.env.ADMIN_OWNER_ID;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!configuredOwner || !secret) return deny();
  // Never bootstrap from an environment value during a request. It must match the
  // independently verified, immutable database binding in this environment.
  const binding = await db.protectedOwner.findUnique({ where: { id: 1 }, include: { user: { select: actorSelect } } });
  if (!binding || binding.userId !== configuredOwner || !binding.user ||
      binding.user.role !== 'super_admin' || !binding.user.emailVerified || binding.user.isDemo ||
      binding.user.suspendedAt || binding.user.deletingAt) return deny();
  const user = await db.user.findUnique({ where: { id: identity.id }, select: actorSelect });
  if (!user || !user.emailVerified || user.suspendedAt || user.deletingAt || user.isDemo ||
      !['admin', 'super_admin'].includes(user.role) ||
      (minimum === 'super_admin' && user.role !== 'super_admin') ||
      !matchesCredentialFingerprint(identity.credentialVersion, userCredentialSource(user), secret)) return deny();
  const actor: Actor = { id: user.id, role: user.role as Actor['role'], owner: user.id === binding.userId,
    suspended: false, credentialVersion: identity.credentialVersion!, reauthenticatedAt: null };
  actor.reauthenticatedAt = await readAdminProof(db, actor);
  return { actor, ownerId: binding.userId };
}

/** Privileges come only from the current server-side row, never JWT role claims. */
export async function requireAdminActor(minimum: 'admin' | 'super_admin'): Promise<Actor> {
  await denyTestContext();
  const session = await getRequestSession();
  await guardMaintenance('read');
  try { return (await readActor(prisma, session?.user, minimum)).actor; }
  catch(error) { if(error instanceof AdminAccessError) throw error; throw new MaintenanceError(); }
}

/** Run the authorization check and mutation in the same transaction and locks.
 * Additional mutation services must acquire user locks through this helper before
 * acquiring other row locks. The callback receives no password/credential rows.
 */
async function runAdminMutation<T>(
  targetId: string,
  operation: AdminOperation,
  work: (tx: Prisma.TransactionClient, actor: Actor, target: Target) => Promise<T>,
  deletionOperationId?: string | null,
): Promise<T> {
  const session = await getRequestSession();
  const identity = session?.user;
  if (!identity?.id || !targetId) return deny();
  return prisma.$transaction(async tx => {
    for (const id of [...new Set([identity.id!, targetId])].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    }
    const { actor, ownerId } = await readActor(tx, identity, 'admin');
    const row = await tx.user.findUnique({ where: { id: targetId },
      select: { id: true, role: true, isDemo: true, deletingAt: true } });
    const deletion = deletionOperationId !== undefined && operation === 'delete'
      ? await tx.accountDeletionOperation.findUnique({ where: { targetId } }) : null;
    if (deletionOperationId && deletion?.id !== deletionOperationId) return deny();
    if (!row && !(deletion?.stage === 'completed' && deletionOperationId)) return deny();
    if (row?.deletingAt && !deletion) return deny();
    const target: Target = { id: targetId, role: (row?.role ?? deletion!.targetRole) as Target['role'], owner: targetId === ownerId, demo: row?.isDemo ?? false };
    if (!canManage(actor, target, operation)) return deny();
    if (['role', 'demo', 'delete'].includes(operation)) requireRecentAdminAuth(actor, Date.now());
    await guardMaintenance('write',undefined,tx);
    const result=await work(tx, actor, target);
    await guardMaintenance('write',undefined,tx);
    return result;
  }, { maxWait: 10_000, timeout: 45_000 });
}

/** For identity proof issuance only; caller must verify the actor's own credential. */
export async function withAdminReauthentication<T>(work: (tx: Prisma.TransactionClient, actor: Actor) => Promise<T>): Promise<T> {
  const session = await getRequestSession();
  if (!session?.user?.id) return deny();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.user.id} FOR UPDATE`;
    const { actor } = await readActor(tx, session.user, 'admin');
    await guardMaintenance('write',undefined,tx);
    const result=await work(tx, actor);
    await guardMaintenance('write',undefined,tx);
    return result;
  });
}
/** Site-wide destructive controls (including maintenance) must use this boundary. */
export async function withAdminControl<T>(work: (tx: Prisma.TransactionClient, actor: Actor) => Promise<T>): Promise<T> {
  return withAdminReauthentication(async (tx, actor) => {
    if (actor.role !== 'super_admin') return deny();
    requireRecentAdminAuth(actor, Date.now());
    return work(tx, actor);
  });
}

export function withAdminMutation<T>(targetId: string, operation: AdminOperation,
 work: (tx: Prisma.TransactionClient, actor: Actor, target: Target) => Promise<T>): Promise<T> {
 return runAdminMutation(targetId, operation, work);
}
/** Deletion-only resume: existing receipt must match the target, including after cascade. */
export function withAccountDeletionMutation<T>(targetId: string, operationId: string | undefined,
 work: (tx: Prisma.TransactionClient, actor: Actor, target: Target) => Promise<T>): Promise<T> {
 return runAdminMutation(targetId, 'delete', work, operationId ?? null);
}
