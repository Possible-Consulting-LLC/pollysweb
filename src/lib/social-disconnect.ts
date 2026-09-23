import { prepareCredentialChange } from './admin/maintenance-access';
import { maintenanceTransaction } from './maintenance-write';
import { randomUUID } from 'node:crypto';
import { matchesCredentialFingerprint, userCredentialSource } from './credential-version';
import { remainingSignInAvailable } from './social-disconnect-policy';
import { configuredSocialProviders, type SocialProviderId } from './social-auth';

export class DisconnectError extends Error {}

export async function disconnectProvider(userId: string, provider: SocialProviderId, credentialVersion: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Authentication configuration missing');
  return maintenanceTransaction(async tx => {
    // Every disconnect locks the keeper first. Two tabs cannot both remove the last two methods.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !matchesCredentialFingerprint(credentialVersion, userCredentialSource(user), secret)) throw new DisconnectError('Please sign in again before disconnecting a method.');
    const accounts = await tx.account.findMany({ where: { userId }, select: { provider: true } });
    if (!accounts.some(account => account.provider === provider)) return;
    if (!remainingSignInAvailable(provider, accounts.map(account => account.provider), configuredSocialProviders(process.env), Boolean(user.passwordHash && user.emailVerified))) {
      throw new DisconnectError('Connect another sign-in method, or verify your email and password, before removing this one. You must keep at least one sign-in method.');
    }
    await prepareCredentialChange(tx,userId);
    await tx.account.deleteMany({ where: { userId, provider } });
    // emailChangeVersion participates in fingerprints for BOTH password and social sessions.
    // Rotating it also invalidates outstanding credential-bound email changes.
    await tx.user.update({ where: { id: userId }, data: { authVersion: randomUUID(), emailChangeVersion: randomUUID() } });
  });
}
