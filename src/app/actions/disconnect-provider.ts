'use server';

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import { getActionUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { signOut } from '@/lib/auth';
import { verifyPassword } from '@/lib/password-policy';
import { allowAction, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { recentSocialAuthentication } from '@/lib/social-disconnect-policy';
import { disconnectProvider, DisconnectError } from '@/lib/social-disconnect';
import { redirect } from 'next/navigation';

export async function disconnectProviderAction(_previous: { error?: string; } | undefined, formData: FormData): Promise<{ error?: string; }> {
  return withMutation(formData, 'identity', 'disconnectprovideraction', async () => {
    const session = await getActionUser();
    if (!session?.id || !session.credentialVersion) return { error: 'Please sign in again.' };
    const provider = formData.get('provider');
    if (provider !== 'google' && provider !== 'facebook' && provider !== 'apple') return { error: 'Choose a connected sign-in method.' };
    if (!await allowAction('password', session.id)) return { error: RATE_LIMIT_MESSAGE };
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { passwordHash: true } });
    if (!user) return { error: 'Please sign in again.' };
    if (user.passwordHash) {
      const password = formData.get('currentPassword');
      if (typeof password !== 'string' || password.length > 1024 || !await verifyPassword(password, user.passwordHash)) return { error: 'Current password is incorrect.' };
    } else if (!recentSocialAuthentication(session.emailChangeReauthAt)) {
      return { error: 'Please sign in again with a connected provider, then retry.' };
    }
    try {
      await disconnectProvider(session.id, provider, session.credentialVersion);
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      if (error instanceof DisconnectError) return { error: error.message };
      console.error('[disconnect-provider] Could not disconnect sign-in method');
      return { error: 'Could not disconnect this method. Please try again.' };
    }
    await signOut({ redirect: false });
    redirect('/login?methodDisconnected=1');

  });
}
