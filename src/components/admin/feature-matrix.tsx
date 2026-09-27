'use client';
import { useMemo, useState, useActionState } from 'react';
import { FEATURE_REGISTRY, registryCategories } from '@/lib/features/registry';
import { summarizePlanForPricing } from '@/lib/features/pricing';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { saveFeatureMatrixAction } from '@/app/admin/plans/actions';

export type FeatureMatrixProps = {
  planId: string;
  planName: string;
  /** The plan's billing options; the preview uses active rows only. */
  options: Array<{ planId: string; interval: string; basePriceCents: number; active: boolean }>;
  /** Registry keys enabled in the saved matrix; everything else starts disabled. */
  initialEnabledKeys: string[];
};

type SaveResult = { error?: string; success?: boolean; warning?: string };

const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const categoryLabel = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

/** Searchable, category-grouped control for every registered feature, with a
 * live pricing preview computed from the unsaved toggle state. Rows stay
 * mounted while searching (a hidden control still submits, a removed one
 * would not), so a save during an active search never disables silently. */
export function FeatureMatrix({ planId, planName, options, initialEnabledKeys }: FeatureMatrixProps) {
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(() => new Set(initialEnabledKeys));
  const [search, setSearch] = useState('');
  const [state, dispatch, pending] = useActionState(
    async (_previous: SaveResult | undefined, formData: FormData): Promise<SaveResult> =>
      saveFeatureMatrixAction(formData),
    undefined,
  );
  // No result prop: MutationForm never resets this form, so the controlled
  // checkboxes keep showing exactly the state that was submitted (and errors
  // keep every toggle). The save boundary dispatches through useActionState.
  const query = search.trim().toLowerCase();
  const summary = useMemo(() => summarizePlanForPricing({ id: planId }, options,
    FEATURE_REGISTRY.map(definition => ({ key: definition.key, enabled: enabled.has(definition.key) }))),
    [planId, options, enabled]);
  const categories = registryCategories();
  const visible = (key: string, name: string, description: string, category: string) =>
    !query || `${key} ${name} ${description} ${category}`.toLowerCase().includes(query);
  const toggle = (key: string, next: boolean) => setEnabled(previous => {
    const updated = new Set(previous);
    if (next) updated.add(key); else updated.delete(key);
    return updated;
  });
  return <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
    <h3 className="font-semibold">Feature matrix</h3>
    <p>Every registered feature has an explicit control. Disabling a feature removes that access from every account assigned to {planName} on its next gate check. Saves upsert the enabled state and never delete rows, so a disabled feature can be restored safely.</p>
    <label className="grid max-w-sm gap-1">Search features
      <input value={search} onChange={event => setSearch(event.target.value)} className="rounded-xl border p-2" />
    </label>
    <p className="text-sm">{enabled.size} of {FEATURE_REGISTRY.length} features enabled</p>
    {state?.warning ? <p role="alert" className="rounded-xl bg-amber-100 p-2 text-sm text-amber-950">{state.warning}</p> : null}
    <div className="grid gap-2 rounded-2xl border border-[var(--plum)]/15 p-3">
      <h4 className="font-semibold">Pricing preview</h4>
      <p className="text-sm">Monthly: {summary.monthlyCents === null ? 'No active monthly price' : price(summary.monthlyCents)} · Annual: {summary.annualCents === null ? 'No active annual price' : price(summary.annualCents)}</p>
      {summary.enabledFeatures.length === 0
        ? <p className="text-sm">No enabled features yet — public pricing would list nothing as included.</p>
        : categories.map(category => {
          const names = summary.enabledFeatures.filter(feature => feature.category === category).map(feature => feature.name);
          return names.length
            ? <p key={category} className="text-sm"><span className="font-semibold">{categoryLabel(category)}</span>: {names.join(', ')}</p>
            : null;
        })}
    </div>
    <MutationForm action={dispatch} className="grid gap-4"><MutationContextInput />
      <input type="hidden" name="planId" value={planId} />
      {categories.map(category => {
        const features = FEATURE_REGISTRY.filter(definition => definition.category === category);
        if (!features.some(definition =>
          visible(definition.key, definition.name, definition.description, definition.category))) return null;
        return <div key={category} className="grid gap-2 border-t border-[var(--plum)]/15 pt-3">
          <h4 className="font-semibold">{categoryLabel(category)}</h4>
          {features.map(definition => <div key={definition.key} className="grid gap-1 rounded-2xl bg-[var(--lavender)]/40 p-3"
            hidden={!visible(definition.key, definition.name, definition.description, definition.category)}>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="feature" value={definition.key} checked={enabled.has(definition.key)}
                onChange={event => toggle(definition.key, event.target.checked)} className="mt-1" />
              <span><span className="font-semibold">{definition.name}</span> <code className="text-xs">{definition.key}</code></span>
            </label>
            <p className="text-sm">{definition.description}</p>
          </div>)}
        </div>;
      })}
      <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
      <button disabled={pending} className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">{pending ? 'Saving…' : 'Save feature matrix'}</button>
      {state?.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    </MutationForm>
  </section>;
}
