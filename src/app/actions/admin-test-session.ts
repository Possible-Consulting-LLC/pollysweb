'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdminActor } from '@/lib/admin/actor';
import { startTestSession, stopTestSession } from '@/lib/admin/test-session-store';
import type { MutationFailure } from '@/lib/mutation-failure';
import { withMutation } from '@/lib/mutation-boundary';
export async function startTestSessionAction(targetId: string, form: FormData): Promise<void | MutationFailure> {
  return withMutation(form, 'admin', 'teststart', async () => {
    const actor = await requireAdminActor('super_admin');
    await startTestSession(actor, targetId);
    revalidatePath('/', 'layout');
    redirect('/home');
  });
}
/** Recovery must remain available after expiry/revocation, without resolving a target. */
export async function stopTestSessionAction(): Promise<void> {
  await stopTestSession();
  revalidatePath('/', 'layout');
  redirect('/admin/demos');
}
