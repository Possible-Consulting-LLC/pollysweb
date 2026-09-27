import { expect, test, PREFIX, escapeRegExp, reauth, screenshot, seedPlan, seedKeeper, setTheme, expectNoHorizontalOverflow, tabTo, keyboardDesktopOnly, prisma } from './fixtures';
import type { Page } from '@playwright/test';

/** Subscriptions surface: list-first rendering verification and the behavior
 * pins — user search by name AND email, wizard completion (with the
 * fold-on-success effect Task 5's unit tests could not pin), End → CANCELED
 * with expiry, and Reassign preselection. */

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
  test('user search hits by name and by email', async ({ page }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Searchable Keeper` });
    await page.goto('/admin/subscriptions?wizard=open&step=1');
    const search = wizard(page).getByRole('textbox', { name: 'Search' });
    // Name match.
    await search.fill(`${PREFIX}Searchable`);
    await expect(wizard(page).getByRole('button', { name: `Select ${keeper.name ?? keeper.email}` })).toBeVisible();
    // Email match.
    await search.fill(keeper.email.split('@')[0]);
    await expect(wizard(page).getByRole('button', { name: `Select ${keeper.name ?? keeper.email}` })).toBeVisible();
    // No matches → explicit empty state.
    await search.fill('zz-e2e-nobody-matches-this');
    await expect(wizard(page).getByText('No keepers match this search.')).toBeVisible();
  });

  test('wizard completes an assignment, folds on success, and audits it', async ({ page, creds }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Assign Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}Assign Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 2500, active: true }] });
    await reauth(page, creds);
    await page.goto('/admin/subscriptions?wizard=open&step=1');
    await wizard(page).getByRole('button', { name: `Select ${keeper.name}` }).click();
    // Single mode folds the list into the focused view.
    await expect(wizard(page).getByText('Selected', { exact: true })).toBeVisible();
    await wizard(page).getByRole('link', { name: 'Continue to plan' }).click();
    await expect(page.getByTestId('wizard-context')).toContainText(keeper.name ?? '');
    await wizard(page).getByRole('button', { name: `Select ${plan.name}` }).click();
    await wizard(page).getByRole('link', { name: 'Continue to options' }).click();
    await wizard(page).getByRole('button', { name: /Select Monthly — \$25\.00/ }).click();
    await expect(page.getByTestId('wizard-summary')).toContainText(plan.name);
    await wizard(page).getByRole('button', { name: 'Assign plan' }).click();
    // FOLD-ON-SUCCESS pin (Task 5's unit tests could not cover this effect):
    // the wizard disappears and the refreshed list shows the new row.
    await expect(wizard(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/wizard=/);
    await expect(rows(page)).toHaveCount(1);
    const row = await prisma.userSubscription.findFirst({ where: { userId: keeper.id }, select: { status: true, planId: true, planBillingOptionId: true, expiresAt: true, renewsAt: true } });
    expect(row).toMatchObject({ status: 'ACTIVE', planId: plan.id, planBillingOptionId: plan.billingOptions[0].id, expiresAt: null });
    await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'plan.assign', targetId: keeper.id,
      reason: { startsWith: `Assigned plan ${plan.name} to user ${keeper.id} effective ` },
    } })).toBe(1);
  });

  test('End ends the subscription: CANCELED with an expiry and out of the list', async ({ page, creds }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}End Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}End Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
    const created = await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: plan.billingOptions[0].id, status: 'ACTIVE', startedAt: new Date() } });
    await reauth(page, creds);
    await page.goto('/admin/subscriptions');
    await expect(rows(page)).toHaveCount(1);
    await rows(page).getByRole('button', { name: 'End' }).click();
    // Row leaves the effective list (effective-only rendering) without reload.
    await expect(rows(page)).toHaveCount(0);
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
    await rows(page).getByRole('link', { name: 'Reassign' }).click();
    await expect(page).toHaveURL(/wizard=open&step=2/);
    await expect(page.getByTestId('wizard-context')).toContainText(keeper.name ?? '');
    // The plan step is an unfolded picker (change affordance not yet needed).
    await expect(wizard(page).getByRole('textbox', { name: 'Search' })).toBeVisible();
  });

  test('list search hits keeper name and email', async ({ page }) => {
    const keeper = await seedKeeper({ name: `${PREFIX}Finder Keeper` });
    const plan = await seedPlan({ name: `${PREFIX}Finder Plan`, active: true,
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
    await prisma.userSubscription.create({ data: { userId: keeper.id, planId: plan.id,
      planBillingOptionId: plan.billingOptions[0].id, status: 'ACTIVE', startedAt: new Date() } });
    await page.goto('/admin/subscriptions');
    const search = page.getByLabel('Search by keeper, plan, or status');
    await search.fill(`${PREFIX}Finder Keeper`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await search.fill(keeper.email.split('@')[0]);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await search.fill('zz-e2e-no-sub-matches');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
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