import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Button } from '@/components/ui/button';
import { createPlanAction } from '../actions';
export const dynamic = 'force-dynamic';

// Same mockup #7 plan-details card anatomy as the builder edit page (the new
// page is the same form minus loaded values — billing options and the feature
// matrix only exist once the plan does).
const fieldClass = 'rounded-xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3 py-2 text-sm';
const labelClass = 'grid gap-1 text-sm font-semibold opacity-85';

export default async function NewPlanPage() {
  await requireAdminActor('super_admin');
  return <>
    <header className="space-y-1">
      <h2 className="text-2xl font-semibold">Create a plan</h2>
      <p className="text-sm opacity-70">
        <Link href="/admin/plans" className="underline">Back to plans</Link>
      </p>
    </header>
    <MutationForm action={createPlanAction}
      className="space-y-3 rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] p-3.5">
      <MutationContextInput />
      <h3 className="text-[13.5px] font-semibold">Plan details</h3>
      <label className={labelClass}>Name
        <input name="name" required maxLength={80} className={fieldClass} /></label>
      <label className={labelClass}>Description
        <textarea name="description" maxLength={500} rows={2} className={fieldClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Plan type
          <select name="planType" className={fieldClass}>
            <option value="STANDARD">Standard</option>
            <option value="CUSTOM">Custom</option>
            <option value="INTERNAL">Internal</option>
          </select></label>
        <label className={labelClass}>Maximum spoods (empty = unlimited)
          <input name="maxSpiders" type="number" min={1} step={1} className={fieldClass} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="h-4 w-4 accent-[var(--plum)]" /> Active</label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" className="h-4 w-4 accent-[var(--plum)]" /> Public (shown on pricing)</label>
      <p className="text-[11.5px] opacity-55">New plans start at the end of the list order. Billing
        options and the feature matrix are built on the plan&apos;s editor page.</p>
      <div className="flex justify-end pt-1">
        <Button type="submit" variant="primary" size="md">Create plan</Button>
      </div>
    </MutationForm>
  </>;
}
