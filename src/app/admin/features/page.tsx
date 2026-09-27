import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { isRegisteredFeatureKey } from '@/lib/features/registry';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { FeaturesAccordion } from '@/components/admin/features-accordion';
import { syncRegistryAction } from './actions';
export const dynamic = 'force-dynamic';

/** Accessible explanation for the header sync button: every registry feature
 * missing from the database is created inactive; existing rows keep their
 * metadata and release state; orphaned rows are never modified. */
const SYNC_DESCRIPTION = 'Creates rows for registry features that are missing, inactive by default. Existing rows keep their metadata and release state; orphaned rows are never modified and are reported in the result.';

export default async function FeatureCatalogPage({ searchParams }:
  { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminActor('super_admin');
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const openKey = one(params.open) ?? '';
  const parsed = parseListQuery(params, { pageSize: 20 });
  const query = { search: parsed.search, page: parsed.page, pageSize: parsed.pageSize };
  const where = query.search
    ? { OR: [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { key: { contains: query.search, mode: 'insensitive' as const } },
      ] }
    : undefined;
  const [rows, total, totalPlans] = await Promise.all([
    prisma.feature.findMany({
      where, orderBy: [{ category: 'asc' }, { key: 'asc' }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.feature.count({ where }),
    prisma.plan.count(),
  ]);
  // A page beyond the (possibly filtered) total re-queries the last valid page.
  const page = clampPage(query.page, total, query.pageSize);
  const pageRows = page === query.page
    ? rows
    : await prisma.feature.findMany({
        where, orderBy: [{ category: 'asc' }, { key: 'asc' }],
        skip: (page - 1) * query.pageSize, take: query.pageSize,
      });
  // One grouped query for the whole page's assignments — never per-row.
  const assignments = pageRows.length
    ? await prisma.featurePlanTranslation.findMany({
        where: { featureId: { in: pageRows.map(row => row.id) }, enabled: true },
        select: { featureId: true, plan: { select: { name: true } } },
      })
    : [];
  const plansByFeature = new Map<string, string[]>();
  for (const translation of assignments) {
    const names = plansByFeature.get(translation.featureId) ?? [];
    names.push(translation.plan.name);
    plansByFeature.set(translation.featureId, names);
  }
  // The registry is the code-owned source; orphans are re-derived here on every render.
  const features = pageRows.map(row => ({
    id: row.id, key: row.key, name: row.name, description: row.description,
    category: row.category, active: row.active,
    orphan: !isRegisteredFeatureKey(row.key),
    assignedPlans: (plansByFeature.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
    totalPlans,
  }));
  return <>
    {/* Mockup .head: plain title with the primary action as a compact header
        button; the explanation lives in the button's accessible description
        (the app's confirm-dialog pattern carries it into the flow). */}
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-semibold">Features</h2>
      <span id="sync-registry-description" className="sr-only">{SYNC_DESCRIPTION}</span>
      <MutationForm action={syncRegistryAction} aria-describedby="sync-registry-description"
        className="flex items-center">
        <MutationContextInput />
        <button type="submit"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-[var(--plum)] px-3 text-sm font-semibold text-[var(--on-accent)] shadow-sm transition active:scale-[0.98] hover:bg-[var(--plum-deep)] disabled:pointer-events-none disabled:opacity-50">
          ⟳ Sync registry</button>
      </MutationForm>
    </header>
    {/* Search lives in the accordion's live toolbar (mockup-exact): typing
        narrows the rendered list live, Enter is the explicit full-page
        fallback navigation. */}
    {/* Selection state lives in the client wrapper; rows, tray, counter, and
        the empty states (committed + narrowed) render there. */}
    <FeaturesAccordion features={features} total={total} search={parsed.search} page={page}
      pageSize={parsed.pageSize} openKey={openKey} />
    {/* The committed pager lives inside the accordion's client island so the
        live-narrowing pager can replace it while matches are in. */}
  </>;
}
