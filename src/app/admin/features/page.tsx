import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { FEATURE_REGISTRY, isRegisteredFeatureKey } from '@/lib/features/registry';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Card } from '@/components/ui/card';
import { saveFeatureMetadataAction, setFeatureReleaseAction, syncRegistryAction } from './actions';
export const dynamic = 'force-dynamic';
export default async function FeatureCatalogPage() {
  await requireAdminActor('super_admin');
  const features = await prisma.feature.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  // The registry is the code-owned source; orphans are re-derived here on every render.
  const missing = FEATURE_REGISTRY.filter(definition => !features.some(row => row.key === definition.key));
  const orphaned = features.filter(row => !isRegisteredFeatureKey(row.key));
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Feature catalog</h2>
      <p>Every feature key comes from the code registry and starts inactive. Releasing a feature makes it available to plans; removing a key from the code leaves its database row orphaned here for review. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
      <p>{FEATURE_REGISTRY.length} registry features · {features.length} in the database · {missing.length} awaiting sync · {orphaned.length} orphaned</p>
    </header>
    <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
      <h3 className="font-semibold">Sync registry</h3>
      <p>Creates rows for registry features that are missing, inactive by default. Existing rows keep their metadata and release state; orphaned rows are never modified and are reported in the result.</p>
      <MutationForm action={syncRegistryAction} className="flex flex-wrap items-end gap-3"><MutationContextInput />
        <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Sync registry</button>
      </MutationForm>
      {missing.length
        ? <p>{missing.length} registry {missing.length === 1 ? 'feature is' : 'features are'} not in the database yet: {missing.map(definition => definition.key).join(', ')}</p>
        : <p>Every registry feature is in the database.</p>}
    </section>
    {features.length === 0 ? <p>No features in the database yet. Run Sync registry to create all {FEATURE_REGISTRY.length} registry features as inactive.</p> : null}
    {features.map(row => {
      const isOrphan = !isRegisteredFeatureKey(row.key);
      return <Card key={row.id} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{row.name}</h3>
          <span className="text-sm">{row.category}</span>
          <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{row.key}</span>
          {row.active
            ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Released</span>
            : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Not released</span>}
          {isOrphan ? <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-950">Orphaned</span> : null}
        </div>
        <p>{row.description}</p>
        {isOrphan ? <p className="text-sm">This key is no longer in the code registry. Its record is kept for review: registry sync never modifies it, and its controls stay locked here until the key returns to the registry or the row is removed by a migration.</p> : null}
        <fieldset disabled={isOrphan} className="grid gap-3">
          <MutationForm action={setFeatureReleaseAction} className="flex flex-wrap items-end gap-3"><MutationContextInput />
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="active" value={row.active ? 'false' : 'true'} />
            <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
            <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">{row.active ? 'Retire release' : 'Release feature'}</button>
          </MutationForm>
          <MutationForm action={saveFeatureMetadataAction} className="grid gap-3 border-t border-[var(--plum)]/15 pt-3 sm:grid-cols-2"><MutationContextInput />
            <input type="hidden" name="key" value={row.key} />
            <label className="grid gap-1">Name<input name="name" defaultValue={row.name} required maxLength={120} className="rounded-xl border p-2" /></label>
            <label className="grid gap-1">Category<input name="category" defaultValue={row.category} required maxLength={40} className="rounded-xl border p-2" /></label>
            <label className="grid gap-1 sm:col-span-2">Description<textarea name="description" defaultValue={row.description} required maxLength={500} rows={2} className="rounded-xl border p-2" /></label>
            <label className="grid gap-1 sm:col-span-2">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
            <button className="rounded-xl bg-[var(--lavender)] p-3 sm:col-span-2">Save metadata</button>
          </MutationForm>
        </fieldset>
      </Card>;
    })}
  </>;
}
