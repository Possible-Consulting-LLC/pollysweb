import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { configuredSocialProviders } from '@/lib/social-auth';
import { AdminPasswordForm } from '@/components/admin/reauth-form';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { confirmAdminSocial } from './actions';
export default async function ReauthPage() {
  const actor = await requireAdminActor('admin');
  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } }),
    prisma.account.findMany({ where: { userId: actor.id }, select: { provider: true } }),
  ]);
  const providers = configuredSocialProviders(process.env).filter(provider => accounts.some(account => account.provider === provider));
  return <><h2 className="text-2xl font-semibold">Confirm your identity</h2>
    <p>Sensitive administrative actions require confirmation with your own sign-in method within the last five minutes.</p>
    {actor.reauthenticatedAt !== null ? <p role="status">You have a recent identity confirmation. It is checked again when you submit an action.</p> : null}
    <Card className="space-y-4">{user?.passwordHash ? <AdminPasswordForm /> : null}
      {providers.map(provider => <MutationForm key={provider} action={confirmAdminSocial}><MutationContextInput />
        <input type="hidden" name="provider" value={provider} /><Button type="submit" variant="soft">Confirm with {provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'Facebook'}</Button>
      </MutationForm>)}
      {!user?.passwordHash && providers.length === 0 ? <p>No available sign-in method. Contact the site owner.</p> : null}
    </Card>
  </>;
}
