import { expect, test, PREFIX, reauth, screenshot, seedPlan, seedKeeper, setTheme, expectNoHorizontalOverflow, tabTo, keyboardDesktopOnly, prisma } from './fixtures';
import type { Page } from '@playwright/test';

/** Subscriptions surface: list-first rendering verification and the behavior
 * pins — keeper search by name AND email on an above-page catalog, the
 * multi-select wizard (batch tray → plan pick → options → "To N keeper(s)")
 * with the legacy plans excluded, the post-assign reset to step 1, End →
 * CANCELED with expiry and the keeper's fallback to a tier-derived row,
 * Reassign preselection, and the Task 11 virtual model (tier-derived rows are
 * display-only with the gold-dashed "Legacy — derived" marker; Edit
 * supersedes in place). */

const wizard = (page: Page) => page.getByTestId('assign-wizard');
const rows = (page: Page) => page.locator('[data-subscription-row]');

test.describe('subscriptions rendering', () => {
  test('list + wizard steps render cleanly in both themes', async ({ page, creds }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Render Keeper`, email: 'zz-e2e-render-keeper@e2e.spoodlyspace.test' });
    const plan = await seedPlan({ name: `${PREFIX}Render Sub Plan`, active: true, public: false,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
    const option = plan.billingOptions.find(candidate => candidate.interval === 'MONTHLY')!;
    // Setup-only row (assignment itself is exercised in the wizard flow test).
    await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: option.id, status: 'ACTIVE', startedAt: new Date() } });
    await page.goto('/admin/subscriptions');
    await expect(page.getByRole('heading', { name: 'Subscriptions', level: 2 })).toBeVisible();
    for (const theme of ['cosmic', 'midnight'] as const) {
      await setTheme(page, creds, theme);
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `subscriptions-list-${theme}`);
      // Wizard steps 1–3 (URL-owned states).
      await page.goto(`/admin/subscriptions?wizard=open&step=1`);
      await expect(wizard(page)).toBeVisible();
      await screenshot(page, `subscriptions-wizard-step1-${theme}`);
      await page.goto(`/admin/subscriptions?wizard=open&step=2&user=${keeper.id}`);
      await expect(page.getByTestId('wizard-context')).toBeVisible();
      await screenshot(page, `subscriptions-wizard-step2-${theme}`);
      await page.goto(`/admin/subscriptions?wizard=open&step=3&user=${keeper.id}&plan=${plan.id}&option=${option.id}`);
      await expect(page.getByTestId('wizard-summary')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `subscriptions-wizard-step3-${theme}`);
    }
  });
});

test.describe('subscriptions behavior pins', () => {
  test('keeper search hits by name and by email (live narrowing, Enter fallback)', async ({ page }) => {
    // S13d: the keeper search input renders only on an above-page catalog —
    // seed a page's worth of fillers so the pin is live regardless of the
    // staging database's own user count (the unit suite's total: 45 pattern).
    for (let index = 1; index <= 20; index++)
      await seedKeeper({ name: `${PREFIX}Filler ${String(index).padStart(2, '0')}` });
    const keeper = await seedKeeper({ name: `${PREFIX}Searchable Keeper` });
    await page.goto('/admin/subscriptions?wizard=open&step=1');
    const search = wizard(page).getByRole('searchbox', { name: 'Search keepers by name or email' });
    const pick = wizard(page).getByRole('checkbox', { name: `Toggle ${keeper.name}` });
    // Name match: typing narrows the RENDERED picker in place (no navigation).
    await search.fill(`${PREFIX}Searchable`);
    await expect(pick).toBeVisible();
    // Email match.
    await search.fill(keeper.email.split('@')[0]);
    await expect(pick).toBeVisible();
    // Enter is the explicit full-page fallback (a committed usearch).
    await search.press('Enter');
    await expect(page).toHaveURL(/usearch=/);
    await expect(pick).toBeVisible();
    // The committed email search matches ONE keeper — below a page — so the
    // S13d rule hides the input; FINALE F3 keeps the in-place Clear instead of
    // stranding the user (same recovery the catalog surfaces pin).
    await wizard(page).getByRole('button', { name: 'Clear' }).click();
    await expect(page).not.toHaveURL(/usearch=/);
    await expect(search).toBeVisible();
    // No matches → explicit narrowed empty state.
    await search.fill('zz-e2e-nobody-matches-this');
    await expect(wizard(page).getByText('Nothing matches “zz-e2e-nobody-matches-this”.')).toBeVisible();
  });

  test('wizard completes a batch assignment through the multi-select flow and audits it', async ({ page, creds }) => {
    const keepers = [
      await seedKeeper({ name: `${PREFIX}Assign Keeper One` }),
      await seedKeeper({ name: `${PREFIX}Assign Keeper Two` }),
    ];
    const plan = await seedPlan({ name: `${PREFIX}Assign Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 2500, active: true }] });
    await reauth(page, creds);
    // No search input is needed here (below-page pickers hide it — S13d):
    // the keepers are reached by computed picker page, exercising the pure
    // row-click multi-select path. The committed picker orders by (name, id),
    // so a straddled page boundary is crossed with the pager (the batch is
    // client-owned and survives soft navigation).
    const orderedUsers = await prisma.user.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true } });
    const pageOf = (keeperId: string) => Math.floor(orderedUsers.findIndex(entry => entry.id === keeperId) / 20) + 1;
    await page.goto(`/admin/subscriptions?wizard=open&step=1${pageOf(keepers[0].id) > 1 ? `&upage=${pageOf(keepers[0].id)}` : ''}`);
    // Multi-select (Task 10): click rows/checkboxes to build the keeper list.
    await wizard(page).getByRole('checkbox', { name: `Toggle ${keepers[0].name}` }).check();
    if (pageOf(keepers[1].id) !== pageOf(keepers[0].id))
      await wizard(page).getByRole('button', { name: 'Next page' }).click();
    await wizard(page).getByRole('checkbox', { name: `Toggle ${keepers[1].name}` }).check();
    // The tray and gold counter follow the batch.
    const tray = page.getByRole('region', { name: 'Selected items' });
    await expect(tray).toBeVisible();
    for (const keeper of keepers) await expect(tray).toContainText(keeper.name ?? '');
    await expect(wizard(page).getByTestId('selected-count')).toHaveText(/2 of \d+ selected/);
    // Continue to the plan step with the batch held.
    await wizard(page).getByRole('link', { name: /Continue/ }).click();
    await expect(page).toHaveURL(/step=2/);
    await expect(page.getByTestId('wizard-context')).toContainText('2 keepers');
    // Task 11: the two legacy plans are the resolver's designation holders —
    // never assignable (excluded by name; still visible on the plans page).
    await expect(wizard(page).getByRole('button', { name: /Select .*Legacy/ })).toHaveCount(0);
    // The plan pick carries its read-only included-features line (Task 10).
    await expect(wizard(page).getByTestId('plan-features').first()).toBeVisible();
    // Picking a plan advances straight to the options step (U6 auto-advance).
    await wizard(page).getByRole('button', { name: `Select ${plan.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`step=3&plan=${plan.id}`));
    await wizard(page).getByRole('button', { name: /Select Monthly — \$25\.00/ }).click();
    // The batch summary names every keeper ("To N keeper(s)").
    await expect(page.getByTestId('wizard-summary')).toContainText('To 2 keepers');
    await expect(page.getByTestId('wizard-summary')).toContainText(keepers[0].name ?? '');
    await wizard(page).getByRole('button', { name: 'Assign plan' }).click();
    // POST-ASSIGN RESET (the mockup's behavior, unit-pinned): back to step 1
    // with the tray cleared, the wizard still open over the refreshed list.
    await expect(page).toHaveURL(/wizard=open&step=1/);
    await expect(wizard(page).getByTestId('selected-count')).toHaveText(/0 of \d+ selected/);
    // Task 11 virtual model: the list is a union — scope to the keepers' rows.
    for (const keeper of keepers)
      await expect(rows(page).filter({ hasText: keeper.name ?? '' })).toHaveCount(1);
    const stored = await prisma.userSubscription.findMany({
      where: { userId: { in: keepers.map(entry => entry.id) } },
      select: { userId: true, status: true, planId: true, planBillingOptionId: true, expiresAt: true } });
    expect(stored).toHaveLength(2);
    for (const keeper of keepers)
      expect(stored.find(row => row.userId === keeper.id)).toMatchObject({
        status: 'ACTIVE', planId: plan.id, planBillingOptionId: plan.billingOptions[0].id, expiresAt: null });
    await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'plan.assign', targetId: { in: keepers.map(entry => entry.id) },
    } })).toBe(2);
  });

  test('End ends the subscription: CANCELED with an expiry, and the keeper falls back to a tier-derived row', async ({ page, creds }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}End Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}End Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
    const created = await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: plan.billingOptions[0].id, status: 'ACTIVE', startedAt: new Date() } });
    await reauth(page, creds);
    await page.goto('/admin/subscriptions');
    // Task 11 virtual model: scope to the keeper's row (other keepers' tier-
    // derived rows fill the union list).
    const keeperRows = rows(page).filter({ hasText: keeper.name ?? '' });
    await expect(keeperRows).toHaveCount(1);
    // Expand the row, then End from the detail card.
    await keeperRows.getByRole('button', { name: keeper.name ?? '' }).click();
    await keeperRows.getByRole('button', { name: 'End', exact: true }).click();
    // The stored row is canceled (leaves the union); the keeper's tier signal
    // (default 'free') takes over — a tier-derived row replaces the real one.
    await expect(keeperRows).toHaveCount(1);
    await expect(keeperRows).toContainText('Legacy — derived');
    const row = await prisma.userSubscription.findUnique({ where: { id: created.id }, select: { status: true, expiresAt: true } });
    expect(row?.status).toBe('CANCELED');
    expect(row?.expiresAt).not.toBeNull();
    await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'subscription.end', targetId: created.id,
      reason: `Ended subscription for user ${keeper.id} (${plan.name} MONTHLY)`,
    } })).toBe(1);
  });

  test('Reassign opens the wizard with the keeper preselected', async ({ page }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Reassign Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}Reassign Plan`, active: true,
      billingOptions: [{ interval: 'ANNUAL', basePriceCents: 25000, active: true }] });
    await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: plan.billingOptions[0].id, status: 'TRIALING', startedAt: new Date() } });
    await page.goto('/admin/subscriptions');
    const keeperRows = rows(page).filter({ hasText: keeper.name ?? '' });
    await expect(keeperRows).toHaveCount(1);
    await keeperRows.getByRole('button', { name: keeper.name ?? '' }).click();
    await keeperRows.getByRole('link', { name: 'Reassign' }).click();
    await expect(page).toHaveURL(/wizard=open&step=2/);
    await expect(page.getByTestId('wizard-context')).toContainText(keeper.name ?? '');
    // The plan picker lists the active plans with their read-only feature
    // lines; below-page catalogs hide the search input (S13d), so the picker
    // is driven by its rows — pick one and land on the options step.
    await expect(wizard(page).getByTestId('picker-count')).toHaveText(/\d+ plans?/);
    await wizard(page).getByRole('button', { name: `Select ${plan.name}` }).click();
    await expect(page).toHaveURL(/step=3/);
    await expect(page.getByTestId('wizard-summary')).toContainText('To 1 keeper');
  });

  test('list search hits keeper name and email; a committed search keeps its Clear', async ({ page }) => {
    const plan = await seedPlan({ name: `${PREFIX}Finder Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
    const keeper = await seedKeeper({ name: `${PREFIX}Finder Keeper` });
    // S13d: the list search input renders only on an above-page list — seed a
    // page's worth of filler subscriptions so the pin is live regardless of
    // the staging database's own effective rows.
    const fillers = [];
    for (let index = 1; index <= 20; index++)
      fillers.push(await seedKeeper({ name: `${PREFIX}Finder Filler ${String(index).padStart(2, '0')}` }));
    await prisma.userSubscription.createMany({ data: fillers.map(filler => ({
      userId: filler.id, planId: plan.id, planBillingOptionId: plan.billingOptions[0].id,
      status: 'ACTIVE', startedAt: new Date() })) });
    await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: plan.billingOptions[0].id, status: 'ACTIVE', startedAt: new Date() } });
    await page.goto('/admin/subscriptions');
    const search = page.getByLabel('Search by keeper, plan, or status');
    await expect(search).toBeVisible();
    // Name match: Enter is the explicit full-page fallback (plain typing
    // never navigates — the soft-navigation design).
    await search.fill(`${PREFIX}Finder Keeper`);
    await search.press('Enter');
    await expect(page).toHaveURL(/search=/);
    await expect(rows(page).filter({ hasText: `${PREFIX}Finder Keeper` })).toHaveCount(1);
    // FINALE F3: the committed search keeps its in-place Clear (a soft
    // navigation back to the unsearched list).
    await page.getByRole('link', { name: 'Clear' }).click();
    await expect(page).not.toHaveURL(/search=/);
    // Email match.
    await search.fill(keeper.email.split('@')[0]);
    await search.press('Enter');
    await expect(rows(page).filter({ hasText: `${PREFIX}Finder Keeper` })).toHaveCount(1);
    // No matches → explicit empty state.
    await search.fill('zz-e2e-no-sub-matches');
    await search.press('Enter');
    await expect(page.getByText('No subscriptions match this search.')).toBeVisible();
  });

  test('subscriptions page is keyboard operable: Tab reaches the add-subscription control', async ({ page }) => {
    keyboardDesktopOnly();
    await page.goto('/admin/subscriptions');
    const add = page.getByRole('link', { name: '＋ Add subscription' });
    await expect(add).toBeVisible();
    await tabTo(page, { role: 'link', name: '＋ Add subscription' });
    await expect(add).toBeFocused();
  });
});
// --- Task 11: virtual subscriptions pivot ------------------------------------

test.describe('virtual subscriptions (Task 11)', () => {
  test('a legacy-tier keeper without a stored subscription renders a display-only tier-derived row', async ({ page }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Legacy Keeper` });
    await page.goto('/admin/subscriptions');
    const keeperRows = rows(page).filter({ hasText: keeper.name ?? '' });
    await expect(keeperRows).toHaveCount(1);
    await expect(keeperRows).toContainText('Free – Legacy');
    await expect(keeperRows).toContainText('Legacy — derived');
    // Derived rows are display-only: no expansion, no End/Reassign/Edit.
    await expect(keeperRows.getByRole('button')).toHaveCount(0);
    await expect(keeperRows.getByRole('link', { name: 'Reassign' })).toHaveCount(0);
  });

  test('Edit supersedes the subscription in place: option + effective date, audited', async ({ page, creds }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Edit Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}Edit Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true },
        { interval: 'ANNUAL', basePriceCents: 10000, active: true }] });
    const monthly = plan.billingOptions.find(option => option.interval === 'MONTHLY')!;
    const annual = plan.billingOptions.find(option => option.interval === 'ANNUAL')!;
    const created = await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: monthly.id, status: 'ACTIVE', startedAt: new Date() } });
    await reauth(page, creds);
    await page.goto('/admin/subscriptions');
    const keeperRows = rows(page).filter({ hasText: keeper.name ?? '' });
    await expect(keeperRows).toHaveCount(1);
    await keeperRows.getByRole('button', { name: keeper.name ?? '' }).click();
    await keeperRows.getByRole('button', { name: 'Edit', exact: true }).click();
    await keeperRows.getByLabel('Billing option').selectOption({ label: 'Annual — $100.00' });
    await keeperRows.getByLabel('Effective date').fill('2026-10-15');
    await keeperRows.getByRole('button', { name: 'Save changes' }).click();
    // Supersede semantics: the old row is end-dated, a new ACTIVE row starts.
    await expect(keeperRows).toContainText('Annual — $100.00');
    const stored = await prisma.userSubscription.findMany({ where: { userId: keeper.id },
      select: { id: true, status: true, planBillingOptionId: true, expiresAt: true } });
    expect(stored).toHaveLength(2);
    const canceled = stored.find(row => row.id === created.id)!;
    expect(canceled.status).toBe('CANCELED');
    expect(canceled.planBillingOptionId).toBe(monthly.id);
    const replacement = stored.find(row => row.id !== created.id)!;
    expect(replacement.status).toBe('ACTIVE');
    expect(replacement.planBillingOptionId).toBe(annual.id);
    await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'plan.assign', targetId: keeper.id,
      reason: `Edited subscription for user ${keeper.id} (${plan.name} ANNUAL) effective 2026-10-15T00:00:00.000Z`,
    } })).toBe(1);
  });
});
