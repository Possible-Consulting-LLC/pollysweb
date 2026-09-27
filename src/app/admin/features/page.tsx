import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { FEATURE_REGISTRY, isRegisteredFeatureKey } from '@/lib/features/registry';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { Button } from '@/components/ui/button';
import { listHref } from '@/components/admin/list-shared';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { FeaturesAccordion } from '@/components/admin/features-accordion';
import { syncRegistryAction } from './actions';
export const dynamic = 'force-dynamic';

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
  const [rows, total, totalPlans, allTotal] = await Promise.all([
    prisma.feature.findMany({
      where, orderBy: [{ category: 'asc' }, { key: 'asc' }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.feature.count({ where }),
    prisma.plan.count(),
    prisma.feature.count(),
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
  const dbFeatures = await prisma.feature.findMany({ select: { key: true } });
  const missing = FEATURE_REGISTRY.filter(definition =>
    !dbFeatures.some(row => row.key === definition.key));
  const orphanedCount = dbFeatures.filter(row => !isRegisteredFeatureKey(row.key)).length;
  const features = pageRows.map(row => ({
    id: row.id, key: row.key, name: row.name, description: row.description,
    category: row.category, active: row.active,
    orphan: !isRegisteredFeatureKey(row.key),
    assignedPlans: (plansByFeature.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
    totalPlans,
  }));
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Feature catalog</h2>
      <p>Every feature key comes from the code registry and starts inactive. Releasing a feature makes it available to plans; removing a key from the code leaves its database row orphaned here for review. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
      {/* Honest stat line: during a search `total` is the filtered count, so
          the unfiltered database count is shown next to it. */}
      <p>{parsed.search
        ? <>{total} matches · {allTotal} in the database · {missing.length} awaiting sync · {orphanedCount} orphaned</>
        : <>{FEATURE_REGISTRY.length} registry features · {total} in the database · {missing.length} awaiting sync · {orphanedCount} orphaned</>}</p>
    </header>
    <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
      <h3 className="font-semibold">Sync registry</h3>
      <p>Creates rows for registry features that are missing, inactive by default. Existing rows keep their metadata and release state; orphaned rows are never modified and are reported in the result.</p>
      <MutationForm action={syncRegistryAction} className="flex flex-wrap items-end gap-3"><MutationContextInput />
        <Button type="submit" variant="primary" size="md">Sync registry</Button>
      </MutationForm>
      {missing.length
        ? <p>{missing.length} registry {missing.length === 1 ? 'feature is' : 'features are'} not in the database yet: {missing.map(definition => definition.key).join(', ')}</p>
        : <p>Every registry feature is in the database.</p>}
    </section>
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
