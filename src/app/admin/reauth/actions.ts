'use server';

import type { MutationFailure } from '@/lib/mutation-failure';

import { withMutation } from '@/lib/mutation-boundary';
import { requireAdminActor, withAdminReauthentication } from '@/lib/admin/actor';
import { createAdminProof, setAdminProofCookie, setAdminChallengeCookie } from '@/lib/admin/reauth-store';
import { verifyPassword } from '@/lib/password-policy';
import { allowAction } from '@/lib/rate-limit';
import { configuredSocialProviders } from '@/lib/social-auth';
import { signIn } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
export async function confirmAdminPassword(_state: { error?: string; success?: boolean }, form: FormData): Promise<{ error?: string; success?: boolean }> {
  return withMutation(form, 'admin', 'confirmadminpassword', async () => {
    try {
      const actor = await requireAdminActor('admin');
      const password = form.get('password');
      if (typeof password !== 'string' || !password || password.length > 1024 || !await allowAction('password', actor.id)) {
        return { error: 'Identity confirmation unavailable. Please try again.' };
      }
      const token = await withAdminReauthentication(async (tx, currentActor) => {
        const row = await tx.user.findUnique({ where: { id: currentActor.id }, select: { passwordHash: true } });
        if (!row?.passwordHash || !await verifyPassword(password, row.passwordHash)) return null;
        return createAdminProof(tx, currentActor);
      });
      if (!token) return { error: 'Your password was not confirmed.' };
      await setAdminProofCookie(token);
      revalidatePath('/admin');
      return { success: true };
    } catch { return { error: 'Identity confirmation unavailable. Please try again.' }; }

  });
}
export async function confirmAdminSocial(form: FormData): Promise<void | MutationFailure> {
  return withMutation(form, 'admin', 'confirmadminsocial', async () => {
    const actor = await requireAdminActor('admin');
    if (!await allowAction('password', actor.id)) throw new Error('Too many attempts. Please try again later.');
    const provider = configuredSocialProviders(process.env).find(value => value === form.get('provider'));
    if (!provider) throw new Error('Connected sign-in provider required.');
    const token = await withAdminReauthentication(async (tx, currentActor) => {
      const account = await tx.account.findFirst({ where: { userId: currentActor.id, provider }, select: { providerAccountId: true } });
      if (!account) throw new Error('Connected sign-in provider required.');
      return createAdminProof(tx, currentActor, { provider, providerAccountId: account.providerAccountId });
    });
    await setAdminChallengeCookie(token);
    await signIn(provider, { redirectTo: '/admin/reauth' }, provider === 'google' ? { prompt: 'select_account', max_age: '0' } : undefined);

  });
}
