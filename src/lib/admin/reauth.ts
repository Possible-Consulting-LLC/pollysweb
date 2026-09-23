import type { Actor } from './policy';
export const ADMIN_REAUTH_MS = 5 * 60_000;
export class AdminReauthenticationError extends Error {
  constructor() { super('Confirm your identity again to continue.'); this.name = 'AdminReauthenticationError'; }
}
export function requireRecentAdminAuth(actor: Actor, now: number): void {
  const time = actor.reauthenticatedAt;
  if (!['admin', 'super_admin'].includes(actor.role) || actor.suspended || !Number.isSafeInteger(now) ||
      time === null || !Number.isSafeInteger(time) || time > now || now - time > ADMIN_REAUTH_MS) {
    throw new AdminReauthenticationError();
  }
}
type Proof = { actorId: string; credentialVersion: string; verifiedAt: Date | null; expiresAt: Date };
export function validReauthProof(proof: Proof | null, actor: Pick<Actor, 'id' | 'credentialVersion'>, now: number): number | null {
  if (!proof || proof.actorId !== actor.id || proof.credentialVersion !== actor.credentialVersion ||
      !proof.verifiedAt || !Number.isFinite(proof.expiresAt.getTime()) || proof.expiresAt.getTime() < now) return null;
  const time = proof.verifiedAt.getTime();
  return Number.isSafeInteger(time) && time <= now && now - time <= ADMIN_REAUTH_MS ? time : null;
}
export function socialReauthMatches(
  challenge: Proof & { provider: string | null; providerAccountId: string | null; createdAt: Date },
  identity: { userId: string; credentialVersion: string; provider: string; providerAccountId: string },
  now: number,
): boolean {
  return challenge.actorId === identity.userId && challenge.credentialVersion === identity.credentialVersion &&
    challenge.provider === identity.provider && challenge.providerAccountId === identity.providerAccountId &&
    challenge.verifiedAt === null && challenge.createdAt.getTime() <= now &&
    challenge.expiresAt.getTime() > now && now - challenge.createdAt.getTime() <= ADMIN_REAUTH_MS;
}
