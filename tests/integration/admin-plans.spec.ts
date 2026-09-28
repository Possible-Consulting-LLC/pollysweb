import { expect, test, PREFIX, prisma, reauth, screenshot, seedPlan, setTheme, expectNoHorizontalOverflow, tabTo, keyboardDesktopOnly, scrollDownUp } from './fixtures';
import type { Page } from '@playwright/test';

/** Plans surface: rendering verification (screenshots × theme × engine ×
 * viewport via the config's projects), layout pins, and the behavior pins from
 * the plan's Review Focus — search filtering, selection persistence across
 * pagination, audited bulk actions, single-open accordion, scroll persistence,
 * and the creator flow itself. */

const listCount = (page: Page) => page.getByText(/^\d+ of \d+ selected$/);
const tray = (page: Page) => page.getByRole('region', { name: 'Selected items' });

test.describe('plans surface rendering', () => {
  test('collapsed + expanded render cleanly in both themes', async ({ page, creds }) => {
    const plan = await seedPlan({ name: `${PREFIX}Render Plan`, description: 'Rendered by the integration suite.' });
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Render')}`);
    await expect(page.getByRole('heading', { name: 'Plans', level: 2 })).toBeVisible();
    for (const theme of ['cosmic', 'midnight'] as const) {
      await setTheme(page, creds, theme);
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `plans-collapsed-${theme}`);
      await page.getByRole('link', { name: new RegExp(plan.name) }).click();
      // Detail cards of the expanded row.
      await expect(page.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Billing options', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Usage', level: 3 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `plans-expanded-${theme}`);
      // Single-open accordion: collapse before the second theme pass.
      await page.getByRole('link', { name: new RegExp(plan.name) }).click();
      await expect(page.getByRole('heading', { name: 'Identity', level: 3 })).toHaveCount(0);
    }
  });

  test('creator page renders and is keyboard operable', async ({ page }) => {
    keyboardDesktopOnly();
    await page.goto('/admin/plans/new');
    await expect(page.getByRole('heading', { name: 'Create a plan', level: 2 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, 'plan-create');
    // Keyboard-only navigation reaches the first field and the submit control.
    const nameInput = page.getByLabel('Name', { exact: true });
    await tabTo(page, { role: 'textbox', name: 'Name' });
    await expect(nameInput).toBeFocused();
    await tabTo(page, { role: 'button', name: 'Create plan' });
    await expect(page.getByRole('button', { name: 'Create plan' })).toBeFocused();
  });
});

test.describe('plans behavior pins', () => {
  test('search filters the list and reports empty results', async ({ page }) => {
    const alpha = await seedPlan({ name: `${PREFIX}Search Alpha` });
    await seedPlan({ name: `${PREFIX}Search Beta` });
    // S13d: the search input renders only on an above-page catalog (the real
    // one is ~4 plans) — seed fillers so the pin is live regardless.
    for (let index = 1; index <= 20; index++)
      await seedPlan({ name: `${PREFIX}Search Filler ${String(index).padStart(2, '0')}` });
    await page.goto('/admin/plans');
    const search = page.getByLabel('Search plans by name');
    await expect(search).toBeVisible();
    // Enter is the explicit full-page fallback (plain typing never navigates).
    await search.fill(`${PREFIX}Search Alpha`);
    await search.press('Enter');
    await expect(page).toHaveURL(/search=/);
    await expect(page.getByRole('link', { name: new RegExp(alpha.name) })).toBeVisible();
    await expect(page.getByText(`${PREFIX}Search Beta`)).toHaveCount(0);
    // FINALE F3: the committed search keeps its in-place Clear.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page).not.toHaveURL(/search=/);
    await expect(page.getByText(`${PREFIX}Search Beta`)).toBeVisible();
    // No matches → explicit empty state, page resets to 1.
    await search.fill(`${PREFIX}No Such Plan`);
    await search.press('Enter');
    await expect(page.getByText(`Nothing matches “${PREFIX}No Such Plan”.`)).toBeVisible();
  });

  test('pagination preserves selection: counter and tray persist across pages', async ({ page }) => {
    for (let index = 1; index <= 25; index++) {
      await seedPlan({ name: `${PREFIX}Page ${String(index).padStart(2, '0')}` });
    }
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Page')}`);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    const first = page.getByRole('checkbox', { name: `Select ${PREFIX}Page 01` });
    await first.check();
    await expect(listCount(page)).toHaveText(`1 of 25 selected`);
    await expect(tray(page)).toBeVisible();
    // Cross the page boundary — selection state is parent-owned, never pruned.
    await page.getByRole('navigation', { name: 'Plans pagination' }).getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(listCount(page)).toHaveText(`1 of 25 selected`);
    await expect(tray(page)).toBeVisible();
    await expect(tray(page).getByText(`${PREFIX}Page 01`)).toBeVisible();
    // A second selection on the far page joins the same tray.
    await page.getByRole('checkbox', { name: `Select ${PREFIX}Page 25` }).check();
    await expect(listCount(page)).toHaveText(`2 of 25 selected`);
    await expect(tray(page).getByText(`${PREFIX}Page 25`)).toBeVisible();
  });

  test('bulk action activates the selected plans and every mutation is audited', async ({ page, creds }) => {
    const one = await seedPlan({ name: `${PREFIX}Bulk One` });
    const two = await seedPlan({ name: `${PREFIX}Bulk Two` });
    await reauth(page, creds);
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Bulk')}`);
    await page.getByRole('checkbox', { name: `Select ${one.name}` }).check();
    await page.getByRole('checkbox', { name: `Select ${two.name}` }).check();
    await expect(listCount(page)).toHaveText('2 of 2 selected');
    await tray(page).getByRole('button', { name: 'Activate', exact: true }).click();
    // DB: both plans flipped; audit: one derived-reason entry per plan.
    await expect.poll(async () => prisma.plan.findUnique({ where: { id: one.id }, select: { active: true } }))
      .toEqual({ active: true });
    await expect.poll(async () => prisma.plan.findUnique({ where: { id: two.id }, select: { active: true } }))
      .toEqual({ active: true });
        await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'plan.update', targetId: { in: [one.id, two.id] },
      reason: { in: [`Activated plan ${one.name}`, `Activated plan ${two.name}`] },
    } })).toBe(2);
    // The revalidation reflects the flipped state without a manual reload.
    await expect(page.getByText('Active', { exact: true })).toHaveCount(2);
  });

  test('accordion is single-open, shows detail cards, and survives scrolling', async ({ page }) => {
    const one = await seedPlan({ name: `${PREFIX}Scroll One` });
    const two = await seedPlan({ name: `${PREFIX}Scroll Two` });
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Scroll')}`);
    const rowLink = (name: string) => page.getByRole('link', { name: new RegExp(name) });
    await rowLink(one.name).click();
    await expect(rowLink(one.name)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Usage', level: 3 })).toBeVisible();
    // Opening the second row folds the first (single-open).
    await rowLink(two.name).click();
    await expect(rowLink(two.name)).toHaveAttribute('aria-expanded', 'true');
    await expect(rowLink(one.name)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'Usage', level: 3 })).toHaveCount(1);
    // Scroll pin (user-reported bug class): a full scroll down and back must
    // not collapse the expanded row or drop its detail.
    await scrollDownUp(page);
    await expect(rowLink(two.name)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Usage', level: 3 })).toBeVisible();
  });

  test('accordion rows are keyboard operable: Tab reaches and Enter expands', async ({ page }) => {
    keyboardDesktopOnly();
    const plan = await seedPlan({ name: `${PREFIX}Keyboard Plan` });
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Keyboard')}`);
    const row = page.getByRole('link', { name: new RegExp(plan.name) });
    const tabs = await tabTo(page, { role: 'link', name: new RegExp(plan.name) });
    expect(tabs).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
  });

  test('creating a plan through the creator UI stores it (description round-trips)', async ({ page, creds }) => {
    await reauth(page, creds);
    await page.goto('/admin/plans/new');
    await page.getByLabel('Name', { exact: true }).fill(`${PREFIX}Created Plan`);
    // NOTE: the form's description textarea carries `required`, so an empty
    // description cannot be submitted through the UI even though the service
    // accepts empty (ratified "descriptions optional" constraint) — recorded
    // as a defect in the task report; this test exercises the UI as shipped.
    await page.getByLabel('Description').fill('Created by the integration suite.');
    await page.getByRole('button', { name: 'Create plan' }).click();
    await expect.poll(async () => prisma.plan.findFirst({ where: { name: `${PREFIX}Created Plan` } }))
      .toMatchObject({ planType: 'STANDARD', description: 'Created by the integration suite.', active: false, public: false, maxSpiders: null });
    await page.goto(`/admin/plans?search=${encodeURIComponent(PREFIX + 'Created')}`);
    await expect(page.getByText(`${PREFIX}Created Plan`)).toBeVisible();
  });
});