import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminActor } from '@/lib/admin/actor';
import { searchAccounts } from '@/lib/admin/accounts';
import { startTestSessionAction, stopTestSessionAction } from '@/app/actions/admin-test-session';
import { setDemoAccountAction } from '@/app/actions/admin-demo';
import { Card } from '@/components/ui/card';

export default async function DemosPage({ searchParams }: { searchParams: Promise<{ q?: string; cursorId?: string; cursorDate?: string; error?: string; saved?: string }> }) {
  await requireAdminActor('super_admin');
  const params = await searchParams;
  const result = await searchAccounts({ query: params.q, role: 'user', verified: true, demo: params.q ? undefined : true,
    cursor: params.cursorId && params.cursorDate ? { id: params.cursorId, createdAt: params.cursorDate } : undefined });
  return <>
    <header className="space-y-2"><h2 className="text-2xl font-semibold">Demo accounts</h2>
      <p>Only designate verified accounts created specifically for testing. Demo designation allows super administrators to access this account for testing and change its real demo records.</p>
      <p>Free and Pro test plans are separate from billing. Removing designation restores the account’s ordinary billing entitlement.</p>
      <Link href="/admin/reauth" className="underline">Confirm your identity before changing designation</Link>
      <form action={stopTestSessionAction}><button className="underline">End previous testing session and return to admin</button></form>
    </header>
    {params.error ? <p role="alert" className="rounded-xl bg-rose-100 p-3">{params.error.slice(0, 500)}</p> : null}
    {params.saved ? <p role="status">Demo designation saved.</p> : null}
    <form className="flex gap-2"><label className="grid flex-1 gap-1">Find a dedicated test account<input name="q" defaultValue={params.q} className="rounded-xl border p-2" /></label><button className="self-end rounded-xl border p-2">Search</button></form>
    {!result.items.length ? <p>No matching accounts. Search by name or email to find a verified dedicated test account.</p> : result.items.map(account => <Card key={account.id} className="space-y-3">
      <h3 className="font-semibold"><Link href={`/admin/accounts/${account.id}`} className="underline">{account.name || account.email}</Link></h3>
      <p>{account.email} · {account.isDemo ? `${account.demoLabel} · ${account.demoPlan} demo` : 'Ordinary account'}</p>
      {account.deletingAt || account.suspendedAt ? <p>This account is unavailable.</p> : <>
        <MutationForm action={async form => { 'use server'; const response = await setDemoAccountAction(account.id, false, form); if (response.error) return response;
    redirect(`/admin/demos?${response.error ? `error=${encodeURIComponent(response.error)}` : 'saved=1'}`); }} className="grid gap-3 sm:grid-cols-2"><MutationContextInput />
          <label className="grid gap-1">Test label<input name="label" defaultValue={account.demoLabel || ''} required maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9 _.\-]*" className="rounded-xl border p-2" /></label>
          <label className="grid gap-1">Test plan<select name="plan" defaultValue={account.demoPlan || 'free'} className="rounded-xl border p-2"><option value="free">Free</option><option value="pro">Pro</option></select></label>
          <label className="sm:col-span-2"><input type="checkbox" name="dedicatedTestAccount" required /> I confirm this is a dedicated test account and understand that super administrators can access and change its records for testing.</label>
          <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
          <label className="grid gap-1">Type DESIGNATE DEMO<input name="confirmation" required className="rounded-xl border p-2" /></label>
          <button className="rounded-xl bg-[var(--lavender)] p-3 sm:col-span-2">Save demo designation</button>
        </MutationForm>
        {account.isDemo ? <MutationForm action={startTestSessionAction.bind(null,account.id)}><MutationContextInput /><button className="rounded-xl border p-3">Test as this demo account</button></MutationForm> : null}
        {account.isDemo ? <MutationForm action={async form => { 'use server'; const response = await setDemoAccountAction(account.id, true, form); if (response.error) return response;
    redirect(`/admin/demos?${response.error ? `error=${encodeURIComponent(response.error)}` : 'saved=1'}`); }} className="grid gap-3 sm:grid-cols-2 border-t pt-3"><MutationContextInput />
          <label className="grid gap-1">Removal reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
          <label className="grid gap-1">Type REMOVE DEMO<input name="confirmation" required className="rounded-xl border p-2" /></label>
          <button className="rounded-xl border p-3 sm:col-span-2">Remove demo designation and test plan</button>
        </MutationForm> : null}
      </>}
    </Card>)}
    {result.nextCursor ? <Link className="underline" href={`/admin/demos?${new URLSearchParams({ q: params.q || '', cursorId: result.nextCursor.id, cursorDate: result.nextCursor.createdAt })}`}>Next page</Link> : null}
  </>;
}
