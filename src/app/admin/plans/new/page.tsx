import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { createPlanAction } from '../actions';
export const dynamic = 'force-dynamic';

export default async function NewPlanPage() {
  await requireAdminActor('super_admin');
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Create a plan</h2>
      <p>New plans start at the end of the list order. An empty spood allowance means unlimited.</p>
    </header>
    <MutationForm action={createPlanAction} className="grid max-w-xl gap-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4"><MutationContextInput />
      <label className="grid gap-1">Name (1–80 characters, no @)<input name="name" required maxLength={80} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Description<textarea name="description" required maxLength={500} rows={2} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Plan type
        <select name="planType" className="rounded-xl border p-2">
          <option value="STANDARD">Standard</option>
          <option value="CUSTOM">Custom</option>
          <option value="INTERNAL">Internal</option>
        </select>
      </label>
      <label className="grid gap-1">Maximum spoods (empty = unlimited)<input name="maxSpiders" type="number" min={1} step={1} className="rounded-xl border p-2" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" /> Active</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="public" /> Public (shown on pricing)</label>
      <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
      <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Create plan</button>
    </MutationForm>
    <p><Link href="/admin/plans" className="underline">Back to plans</Link></p>
  </>;
}
