import { getAdminDateFormatter } from '@/lib/admin/reporting';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { notFound, redirect } from 'next/navigation';
import { getAccountDetail } from '@/lib/admin/accounts';
import { requireAdminActor } from '@/lib/admin/actor';
import { canManage, type Target } from '@/lib/admin/policy';
import { requestAdminEmailChangeAction, setAccountRoleAction, setAccountSuspendedAction, updateAccountAction } from '@/app/actions/admin-accounts';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { DeleteAccount } from '@/components/admin/delete-account';
import { Card } from '@/components/ui/card';

export default async function AccountDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const feedback = await searchParams;
  const [actor, account] = await Promise.all([requireAdminActor('admin'), getAccountDetail(id)]);
  if (!account) notFound();
  const version = account.accountVersion;
  const target: Target = { id: account.id, role: account.role as Target['role'], owner: account.owner, demo: account.isDemo };
  const editable = !account.deletingAt && canManage(actor, target, 'edit');
  const suspendable = !account.deletingAt && canManage(actor, target, 'suspend');
  const roleEditable = !account.deletingAt && canManage(actor, target, 'role');
  async function saveProfile(form: FormData) { 'use server'; const result = await updateAccountAction(id, version, form);
    if (result.error) return result;
    redirect(`/admin/accounts/${id}?${result.error ? `error=${encodeURIComponent(result.error)}` : 'saved=profile'}`); }
  async function changeEmail(form: FormData) { 'use server'; const result = await requestAdminEmailChangeAction(id, form);
    if (result.error) return result;
    redirect(`/admin/accounts/${id}?${result.error ? `error=${encodeURIComponent(result.error)}` : 'saved=email'}`); }
  async function changeRole(form: FormData) { 'use server';
    const result = await setAccountRoleAction(id, version, String(form.get('role')) as Target['role'], form);
    if (result.error) return result;
    redirect(`/admin/accounts/${id}?${result.error ? `error=${encodeURIComponent(result.error)}` : 'saved=role'}`); }
  const { dates, timezone } = await getAdminDateFormatter();
  return <><div><h2 className="text-2xl font-semibold">{account.name || 'Unnamed account'}</h2><p className="break-all">{account.email} · {account.id}</p></div>
    {feedback.error ? <p role="alert" className="rounded-xl bg-rose-100 p-3 text-rose-800">{feedback.error.slice(0, 500)}</p> : null}
    {feedback.saved ? <p role="status" className="rounded-xl bg-emerald-100 p-3 text-emerald-950">{feedback.saved === 'email' ? 'Confirmation sent; the current address remains active.' : 'Account changes saved.'}</p> : null}
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2"><h3 className="font-semibold">Account summary</h3><p className="text-sm">Times in {timezone}.</p>
        <p>Joined: <time dateTime={account.createdAt.toISOString()}>{dates.format(account.createdAt)}</time></p>
        <p>Role: {account.role} · {account.emailVerified ? 'Email verified' : 'Email unverified'} · {account.deletingAt ? 'Deletion pending — access blocked' : account.suspendedAt ? 'Suspended' : 'Active'}</p>
        <p>Sign-in methods: {account.accounts.map(item => item.provider).join(', ') || (account.emailVerified ? 'verified email/password if configured' : 'none shown')}</p>
        <p>Current entitlement: {account.entitlement === 'pro' ? 'Pro' : 'Free'} · Recorded plan: {account.plan}</p>
      </Card>
      <Card className="space-y-2"><h3 className="font-semibold">Care activity</h3><p>{account._count.spiders} spoods · {account._count.careDays} care days</p>
        <p>{account.care.feedingCount} feedings · {account.care.mistingCount} mistings · {account.care.moltCount} molts</p>
        <p>{account.care.observationCount} observations · {account.care.conditionCount} body checks · {account.care.maintenanceCount} enclosure events</p>
        <p>Latest recorded care: {account.care.latest ? dates.format(account.care.latest) : 'No care event recorded'}</p><p>No last-login date is recorded.</p>
      </Card>
    </div>
    <Card className="space-y-2"><h3 className="font-semibold">Billing summary</h3>
      <p>Status: {account.subscriptionStatus || 'No recorded subscription'} · Customer: {account.stripeCustomerId || 'None'} · Failures: {account.billingCheckFailures}</p>
      <p>Last successful check: {account.billingLastCheckedAt ? dates.format(account.billingLastCheckedAt) : 'Never'} · Next check: {account.billingNextCheckAt ? dates.format(account.billingNextCheckAt) : 'Not scheduled'}</p>
      <p>Suspending this account revokes app access. It does not cancel or change Stripe billing.</p>
    </Card>
    {editable ? <Card><h3 className="mb-3 font-semibold">Profile and preferences</h3><MutationForm action={saveProfile} className="grid gap-3 sm:grid-cols-2"><MutationContextInput />
      <label className="grid gap-1">Name<input name="name" maxLength={120} defaultValue={account.name ?? ''} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Timezone<input name="timezone" defaultValue={account.timezone} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Date format<select name="dateFormat" defaultValue={account.dateFormat} className="rounded-xl border p-2">{['MMM d, yyyy', 'd MMM yyyy', 'yyyy-MM-dd'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1">Measurement<select name="measurement" defaultValue={account.measurement} className="rounded-xl border p-2"><option value="imperial">Imperial</option><option value="metric">Metric</option></select></label>
      <label className="grid gap-1">Theme<select name="theme" defaultValue={account.theme} className="rounded-xl border p-2"><option value="system">System</option><option value="cosmic">Cosmic</option><option value="midnight">Midnight</option></select></label>
      {([['feedDefaultDays', 'Feeding days', account.feedDefaultDays], ['mistDefaultDays', 'Misting days', account.mistDefaultDays], ['cleanDefaultDays', 'Cleaning days', account.cleanDefaultDays]] as const).map(([name, label, defaultValue]) =>
        <label key={name} className="grid gap-1">{label}<input name={name} type="number" min={1} max={365} defaultValue={defaultValue} className="rounded-xl border p-2" /></label>)}
      <label className="grid gap-1 sm:col-span-2">Reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
      <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)] sm:col-span-2">Save profile</button>
    </MutationForm></Card> : <p>This account is visible but cannot be edited by your administrative role.</p>}
    {editable ? <Card><h3 className="font-semibold">Verified email change</h3><p>The current address remains active until the new inbox confirms the link. Entering an address never grants verification.</p>
      <MutationForm action={changeEmail} className="mt-3 grid gap-3 sm:grid-cols-2"><MutationContextInput /><label className="grid gap-1">New email<input name="email" type="email" required maxLength={254} className="rounded-xl border p-2" /></label>
        <label className="grid gap-1">Reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label><button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)] sm:col-span-2">Send confirmation</button></MutationForm>
    </Card> : null}
    {suspendable ? <Card className="space-y-3"><h3 className="font-semibold">Access control</h3><p>Suspension revokes sessions and pending identity changes. Billing continues until separately managed.</p>
      <ConfirmAction label={account.suspendedAt ? 'Reinstate account' : 'Suspend account'} confirmation={account.suspendedAt ? 'REINSTATE ACCOUNT' : 'SUSPEND ACCOUNT'}
        description={account.suspendedAt ? 'Restore app access. This does not alter billing.' : 'Revoke app access and sessions. This does not cancel billing.'}
        action={setAccountSuspendedAction.bind(null, id, account.accountVersion, !account.suspendedAt)} /></Card> : null}
    {roleEditable ? <Card><h3 className="font-semibold">Administrative role</h3><p>Recent identity confirmation is required. The target must be verified and cannot be a demo account.</p>
      <MutationForm action={changeRole} className="mt-3 grid gap-3 sm:grid-cols-2"><MutationContextInput /><select name="role" defaultValue={account.role} className="rounded-xl border p-2"><option value="user">User</option><option value="admin">Admin</option><option value="super_admin">Super admin</option></select>
        <input name="reason" required maxLength={500} placeholder="Reason" className="rounded-xl border p-2" /><input name="confirmation" required placeholder="Type CHANGE ROLE" className="rounded-xl border p-2" />
        <button className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800">Change role</button></MutationForm></Card> : null}
    {canManage(actor, target, 'delete') ? <DeleteAccount targetId={id} email={account.email} /> : null}
  </>;
}
