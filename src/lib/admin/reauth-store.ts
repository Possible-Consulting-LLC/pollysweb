import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { credentialFingerprint, userCredentialSource } from '../credential-version';
import { ADMIN_REAUTH_MS, socialReauthMatches, validReauthProof } from './reauth';
import { appendAudit } from './audit';
import type { Actor } from './policy';

type Database = Pick<Prisma.TransactionClient, 'adminReauth'>;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function adminProofCookie(url?: string) {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? url;
  const secure = configured ? new URL(configured).protocol === 'https:' : process.env.NODE_ENV === 'production';
  return { name: secure ? '__Host-admin-reauth' : 'admin-reauth',
    options: { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, path: '/', maxAge: 300 } };
}
export function adminChallengeCookie(url?: string) {
  const proof = adminProofCookie(url);
  return { ...proof, name: proof.name + '-pending' };
}
function requestToken(request: Request | undefined): string | null {
  if (!request) return null;
  const name = adminChallengeCookie(request.url).name;
  const value = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ?? null;
}
async function findProof(db: Database, token: string | null | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.adminReauth.findUnique({ where: { tokenHash: digest(token) } });
}
export async function readAdminProof(db: Database, actor: Actor): Promise<number | null> {
  const token = (await cookies()).get(adminProofCookie().name)?.value;
  return validReauthProof(await findProof(db, token), actor, Date.now());
}
/** Issue only after actor/password verification, or as an unverified OAuth challenge. */
export async function createAdminProof(tx: Prisma.TransactionClient, actor: Actor,
  social?: { provider: string; providerAccountId: string }): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  await tx.adminReauth.create({ data: { tokenHash: digest(token), actorId: actor.id,
    credentialVersion: actor.credentialVersion, provider: social?.provider ?? null,
    providerAccountId: social?.providerAccountId ?? null, createdAt: now,
    verifiedAt: social ? null : now, expiresAt: new Date(now.getTime() + ADMIN_REAUTH_MS) } });
  await appendAudit(tx, { actorId: actor.id, targetId: null,
    action: social ? 'reauth.attempt' : 'reauth.success', reason: 'Administrator identity confirmation',
    changes: { method: social?.provider ?? 'password' } });
  // Indexed, bounded expiry cleanup. Proofs have no value after their expiry.
  await tx.$executeRaw`DELETE FROM "AdminReauth" WHERE "tokenHash" IN
    (SELECT "tokenHash" FROM "AdminReauth" WHERE "expiresAt" < NOW() ORDER BY "expiresAt" LIMIT 100)`;
  return token;
}
export async function setAdminProofCookie(token: string) {
  const cookie = adminProofCookie();
  (await cookies()).set(cookie.name, token, cookie.options);
}
export async function setAdminChallengeCookie(token: string) {
  const cookie = adminChallengeCookie();
  (await cookies()).set(cookie.name, token, cookie.options);
}
/** Settings OAuth explicitly abandons a previous admin handshake, preserving verified proof. */
export async function clearAdminSocialChallenge() {
  const cookie = adminChallengeCookie();
  const jar = await cookies();
  const token = jar.get(cookie.name)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) await prisma.adminReauth.deleteMany({ where: { tokenHash: digest(token), verifiedAt: null } });
  if (token !== undefined) jar.set(cookie.name, '', { ...cookie.options, maxAge: 0 });
}
export async function revokeAdminProof() {
  await clearAdminSocialChallenge();
  const cookie = adminProofCookie();
  const token = (await cookies()).get(cookie.name)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) await prisma.adminReauth.deleteMany({ where: { tokenHash: digest(token) } });
  if (token) (await cookies()).set(cookie.name, '', { ...cookie.options, maxAge: 0 });
}
async function rejectSocialProof(tx: Prisma.TransactionClient, challenge: Awaited<ReturnType<typeof findProof>>): Promise<false> {
  if (challenge && !challenge.verifiedAt) await appendAudit(tx, { actorId: challenge.actorId, targetId: null,
    action: 'reauth.failure', reason: 'Administrator identity confirmation rejected', changes: { method: challenge.provider ?? 'social' } });
  return false;
}
type ProviderAccount = { provider: string; providerAccountId: string };
/** Called before Auth.js can link or resolve the callback. Never permits a new link. */
export async function authorizeAdminSocialReauth(request: Request | undefined, account: ProviderAccount): Promise<boolean> {
  const token = requestToken(request);
  if (token === null) return true; // Ordinary OAuth flow retains its own existing checks.
  const challenge = await findProof(prisma, token);
  if (!challenge) return false;
  const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: account },
    select: { userId: true, user: { select: { id: true, passwordHash: true, authVersion: true, emailChangeVersion: true,
      adminVersion: true, role: true, suspendedAt: true, deletingAt: true, emailVerified: true, isDemo: true } } } });
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!linked || !secret || !linked.user.emailVerified || linked.user.isDemo || linked.user.suspendedAt || linked.user.deletingAt ||
      !['admin', 'super_admin'].includes(linked.user.role)) return rejectSocialProof(prisma, challenge);
  const matches = socialReauthMatches(challenge, { ...account, userId: linked.userId,
    credentialVersion: credentialFingerprint(userCredentialSource(linked.user), secret) }, Date.now());
  return matches || await rejectSocialProof(prisma, challenge);
}
/** Complete only from the verified OAuth JWT callback, with user ID resolved by Auth.js. */
export async function completeAdminSocialReauth(request: Request | undefined, account: ProviderAccount,
  actorId: string, credentialVersion: string): Promise<boolean> {
  const token = requestToken(request);
  if (token === null) return true;
  const completed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;
    const challenge = await findProof(tx, token);
    const current = await tx.user.findUnique({ where: { id: actorId } });
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!current || !secret || !current.emailVerified || current.suspendedAt || current.deletingAt || current.isDemo ||
        !['admin', 'super_admin'].includes(current.role) ||
        credentialFingerprint(userCredentialSource(current), secret) !== credentialVersion) return rejectSocialProof(tx, challenge);
    const now = new Date();
    if (!challenge || !socialReauthMatches(challenge, { ...account, userId: actorId, credentialVersion }, now.getTime())) return rejectSocialProof(tx, challenge);
    const linked = await tx.account.findUnique({ where: { provider_providerAccountId: account }, select: { userId: true } });
    if (linked?.userId !== actorId) return rejectSocialProof(tx, challenge);
    const updated = await tx.adminReauth.updateMany({ where: { tokenHash: digest(token), verifiedAt: null,
      expiresAt: { gt: now } }, data: { verifiedAt: now, expiresAt: new Date(now.getTime() + ADMIN_REAUTH_MS) } });
    if (updated.count !== 1) return false;
    await appendAudit(tx, { actorId, targetId: null, action: 'reauth.success', reason: 'Administrator identity confirmation', changes: { method: account.provider } });
    return true;
  });
  if (completed) {
    await setAdminProofCookie(token);
    await clearAdminSocialChallenge();
  }
  return completed;
}
