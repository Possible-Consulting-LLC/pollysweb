import { getAdminDateFormatter } from '@/lib/admin/reporting';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import Link from 'next/link';
import { recoverDemoCheckoutAction } from '@/app/actions/admin-demo';
import { requireAdminActor } from '@/lib/admin/actor';
import { redirect } from 'next/navigation';
import { completeFacebookDeletionAction } from '@/app/actions/admin-accounts';
import { listAdminOperations } from '@/lib/admin/accounts';
import { Card } from '@/components/ui/card';

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string; completed?: string }> }) {
  const actor = await requireAdminActor('admin');
  const feedback = await searchParams;
  const operations = await listAdminOperations();
  const { dates, timezone } = await getAdminDateFormatter();
  return <><div><h2 className="text-2xl font-semibold">Operations</h2><p>Provider-data requests and billing reconciliation failures requiring review. Times in {timezone}.</p></div>
    {feedback.error ? <p role="alert" className="rounded-xl bg-rose-100 p-3 text-rose-800">{feedback.error.slice(0, 500)}</p> : null}
    {feedback.completed ? <p role="status" className="rounded-xl bg-emerald-100 p-3 text-emerald-950">Facebook provider data removed and request completed.</p> : null}
    <section className="space-y-3"><h3 className="text-xl font-semibold">Facebook deletion requests</h3>
      {!operations.facebookRequests.length ? <p>No pending requests.</p> : operations.facebookRequests.map(request => <Card key={request.id} className="space-y-3">
        <p><strong>{request.status}</strong> · received {dates.format(request.createdAt)} · confirmation {request.confirmationCode}</p>
        {!request.user ? <p>No account mapping is available. Verify ownership through support before any action.</p> : <>
          <p><Link href={`/admin/accounts/${request.user.id}`} className="underline">{request.user.name || request.user.email}</Link> · role {request.user.role} · methods {request.user.accounts.map(item => item.provider).join(', ') || 'none'}</p>
          <p>Completion removes only the reviewed Facebook identity/provider data. It does not delete spoods, photos, care history, billing, or the account.</p>
          <MutationForm action={async form => { 'use server'; const result = await completeFacebookDeletionAction(request.user!.id, request.user!.accountVersion, request.id, form);
            if (result.error) return result;
    redirect(`/admin/operations?${result.error ? `error=${encodeURIComponent(result.error)}` : 'completed=1'}`); }} className="grid gap-3 sm:grid-cols-2"><MutationContextInput />
            <label className="grid gap-1">Name provenance<select name="nameProvenance" required className="rounded-xl border p-2"><option value="">Choose after review</option><option value="independent">Independently supplied — keep</option><option value="remove">Facebook supplied — remove</option></select></label>
            <label className="grid gap-1">Image provenance<select name="imageProvenance" required className="rounded-xl border p-2"><option value="">Choose after review</option><option value="independent">Independently supplied — keep</option><option value="remove">Facebook supplied — remove</option></select></label>
            <label className="grid gap-1">Email review<select name="emailProvenance" required className="rounded-xl border p-2"><option value="">Choose after review</option><option value="independent_verified">Independently verified/adopted</option></select></label>
            <label className="grid gap-1">Reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
            <label className="grid gap-1 sm:col-span-2">Final confirmation<input name="confirmation" required placeholder="Type COMPLETE FACEBOOK DELETION" className="rounded-xl border p-2" /></label>
            <button className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800 sm:col-span-2">Remove reviewed Facebook data and complete</button>
          </MutationForm></>}
      </Card>)}</section>
    <section className="space-y-3"><h3 className="text-xl font-semibold">Unresolved checkout requests</h3>
      <p>These requests block demo designation and account deletion, even when Stripe IDs have not been acknowledged. Recovery replays only the original request and may reconstruct its open checkout; it cannot complete a purchase.</p>
      <Link href="/admin/reauth" className="underline">Confirm identity for recovery</Link>
      {operations.checkoutIntents.length === 0 ? <p>No unresolved checkout requests.</p> : operations.checkoutIntents.map(intent => {
        const expired = intent.recoveryExpired;
        return <Card key={intent.id} className="space-y-3">
          <Link href={`/admin/accounts/${intent.userId}`} className="underline">Review account</Link>
          <p>Started {dates.format(intent.createdAt)} · {intent.phase} · {expired ? 'Recovery window expired' : 'Unresolved provider outcome'}</p>
          {expired ? <p>Investigate provider and application logs. Automatic replay or clearing is unavailable because the original idempotency key may expire.</p> : actor.role === 'super_admin' ?
            <MutationForm action={async form => { 'use server'; const result = await recoverDemoCheckoutAction(intent.userId, form); if (result.error) return result;
    redirect(`/admin/operations${result.error ? '?error=' + encodeURIComponent(result.error) : ''}`); }} className="grid gap-2 sm:grid-cols-2"><MutationContextInput />
              <label className="grid gap-1">Recovery reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
              <label className="grid gap-1">Type RECOVER CHECKOUT<input name="confirmation" required className="rounded-xl border p-2" /></label>
              <button className="rounded-xl border p-3 sm:col-span-2">Recover original checkout request</button>
            </MutationForm> : <p>A super administrator must review recovery.</p>}
        </Card>;
      })}
    </section>
    <section className="space-y-3"><h3 className="text-xl font-semibold">Billing reconciliation failures</h3><p>This view is read-only. Use Stripe for billing management.</p>
      {!operations.billingFailures.length ? <p>No recorded failures.</p> : operations.billingFailures.map(item => <Card key={item.id} className="space-y-1">
        <p><Link href={`/admin/accounts/${item.id}`} className="font-semibold underline">{item.name || item.email}</Link> · {item.billingCheckFailures} failures · {item.subscriptionStatus || 'no status'}</p>
        {item.isDemo ? <p role="alert">Unexpected demo billing association. Investigate in Stripe; the demo plan has been retained.</p> : null}
        <p>Last success: {item.billingLastCheckedAt ? dates.format(item.billingLastCheckedAt) : 'never'} · next retry: {item.billingNextCheckAt ? dates.format(item.billingNextCheckAt) : 'not scheduled'}</p>
        {item.dashboardUrl ? <a href={item.dashboardUrl} target="_blank" rel="noreferrer" className="underline">Open customer in Stripe Dashboard</a> : <span>No Stripe customer link available.</span>}
      </Card>)}</section>
  </>;
}
