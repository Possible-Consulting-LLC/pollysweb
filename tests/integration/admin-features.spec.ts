import { expect, test, PREFIX, escapeRegExp, screenshot, seedPlan, seedOrphanFeature, setTheme, expectNoHorizontalOverflow, tabTo, keyboardDesktopOnly, scrollDownUp, prisma, reauth } from './fixtures';
import type { Page } from '@playwright/test';
import { FEATURE_REGISTRY } from '@/lib/features/registry';

/** Features catalog + plan-editor matrix: rendering verification (screenshots ×
 * theme × engine × viewport via the config's projects) and the behavior pins —
 * cross-page selection persistence, orphaned-feature inertness, and the matrix
 * save that must submit the FULL enabled set across a page boundary. No
 * registered feature's row is ever mutated here; selection tests never fire
 * bulk actions, so only ZZ-e2e- rows are created and removed. */

const counter = (page: Page) => page.getByTestId('selected-count');
const tray = (page: Page) => page.getByRole('region', { name: 'Selected items' });
/** Row links carry the unique key badge in their accessible name. */
const rowLink = (page: Page, key: string) => page.getByRole('link', { name: new RegExp(escapeRegExp(key)) });

const matrixSection = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Features', level: 3 }) });
const matrixAlerts = (page: Page) => matrixSection(page).getByRole('alert');

test.describe('features catalog rendering', () => {
  test('collapsed + expanded + orphaned render cleanly in both themes', async ({ page, creds }) => {
    const orphan = await seedOrphanFeature();
    // Only the current page's rows can be opened: use the first catalog row.
    const first = await prisma.feature.findFirst({ orderBy: [{ category: 'asc' }, { key: 'asc' }], where: { key: { not: { startsWith: 'zz-e2e-' } } }, select: { key: true } });
    await page.goto('/admin/features');
    await expect(page.getByRole('heading', { name: 'Features', level: 2 })).toBeVisible();
    for (const theme of ['cosmic', 'midnight'] as const) {
      await setTheme(page, creds, theme);
      // The former mobile-only exemption (long key badges overflowed the row)
      // is gone: the KNOWN-DEFECT pin now fails with scrollWidth == clientWidth
      // on both mobile projects, so the strict assertion covers every viewport.
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `features-collapsed-${theme}`);
            await page.goto(`/admin/features?open=${first!.key}`);
      await expect(page.getByRole('heading', { name: 'Detail', level: 3 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `features-expanded-${theme}`);
      await page.goto(`/admin/features?open=${orphan.key}`);
      await expect(page.getByText('This key is no longer in the code registry.')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `features-orphan-${theme}`);
    }
  });

  test('search matches by name or key and reports empty results', async ({ page }) => {
    const orphan = await seedOrphanFeature();
    await page.goto('/admin/features');
    const search = page.getByLabel('Search features by name or key');
    // Typing narrows the rendered catalog in place (no navigation, no button).
    await search.fill(orphan.key);
    await expect(page.getByTestId('narrowed-features')).toBeVisible();
    await expect(page.getByText(new RegExp(escapeRegExp(orphan.name)))).toBeVisible();
    // Enter is the explicit full-page fallback (a committed URL search).
    await search.press('Enter');
    await expect(page).toHaveURL(/search=/);
    await expect(page.getByText(new RegExp(escapeRegExp(orphan.name)))).toBeVisible();
    // The gold counter stays in the mockup's "N of M selected" format,
    // truthful for the committed search (the retired chip said "1 match").
    await expect(page.getByTestId('selected-count')).toHaveText('0 of 1 selected');
    // FINALE F3: the committed search keeps its in-place Clear.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page).not.toHaveURL(/search=/);
    // No matches → explicit empty state, page resets to 1.
    await search.fill('zz-e2e-nothing-matches-this');
    await search.press('Enter');
    await expect(page.getByText('Nothing matches “zz-e2e-nothing-matches-this”.')).toBeVisible();
  });

  test('orphaned feature is greyed and its controls are inert', async ({ page }) => {
    const orphan = await seedOrphanFeature();
    await page.goto(`/admin/features?open=${orphan.key}`);
    // The disabled fieldset makes every control inside it inert (the release
    // button, the metadata inputs); the row's select checkbox is disabled too.
    await expect(page.getByRole('button', { name: 'Release feature' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit metadata' })).toBeDisabled();
    await expect(page.getByText('This key is no longer in the code registry.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Select ${orphan.name}` })).toBeDisabled();
  });
});

test.describe('features behavior pins', () => {
  test('selection persists across pagination: counter and tray unchanged', async ({ page }) => {
    await seedOrphanFeature(); // 34 registry rows + 1 orphan → 2 pages of 20
    const total = await prisma.feature.count();
    expect(total).toBeGreaterThan(20);
    // Catalog order is (category, key); orphaned rows are excluded from
    // selection entirely, so resolve registry rows only.
    const ordered = await prisma.feature.findMany({ where: { key: { not: { startsWith: 'zz-e2e-' } } }, orderBy: [{ category: 'asc' }, { key: 'asc' }], select: { key: true, name: true } });
    const [page1, page2] = [ordered[0], ordered[20]];
    await page.goto('/admin/features');
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('checkbox', { name: `Select ${page1.name}` }).check();
    await expect(counter(page)).toHaveText(`1 of ${total} selected`);
    await expect(tray(page)).toBeVisible();
    await page.getByRole('navigation', { name: 'Features pagination' }).getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(counter(page)).toHaveText(`1 of ${total} selected`);
    await expect(tray(page)).toBeVisible();
    await expect(tray(page).getByText(page1.name)).toBeVisible();
    await page.getByRole('checkbox', { name: `Select ${page2.name}` }).check();
    await expect(counter(page)).toHaveText(`2 of ${total} selected`);
    await expect(tray(page).getByText(page2.name)).toBeVisible();
  });

  test('catalog accordion is single-open and survives scrolling', async ({ page }) => {
    await page.goto('/admin/features');
    // Catalog order is (category, key): resolve real adjacent rows from the DB.
    const [first, second] = await prisma.feature.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }], select: { key: true }, take: 2 });
    await rowLink(page, first.key).click();
    await expect(rowLink(page, first.key)).toHaveAttribute('aria-expanded', 'true');
    await rowLink(page, second.key).click();
    await expect(rowLink(page, second.key)).toHaveAttribute('aria-expanded', 'true');
    await expect(rowLink(page, first.key)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'Detail', level: 3 })).toHaveCount(1);
    // Scroll pin: wheel down and back must not collapse the row.
    await scrollDownUp(page);
    await expect(rowLink(page, second.key)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Detail', level: 3 })).toBeVisible();
  });

  test('catalog rows are keyboard operable: Tab reaches and Enter expands', async ({ page }) => {
    keyboardDesktopOnly();
    await page.goto('/admin/features');
    const first = await prisma.feature.findFirst({ orderBy: [{ category: 'asc' }, { key: 'asc' }], select: { key: true } });
    await tabTo(page, { role: 'link', name: new RegExp(escapeRegExp(first!.key)) });
    await page.keyboard.press('Enter');
    await expect(rowLink(page, first!.key)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Detail', level: 3 })).toBeVisible();
  });
});

test.describe('plan-editor feature matrix', () => {
  test('matrix render, counter parity, tray, and a full-set save across a page boundary', async ({ page, creds }) => {
    const plan = await seedPlan({ name: `${PREFIX}Matrix Plan` });
    const [first, , , , , , , , , , , , , , , , , , , , second] = FEATURE_REGISTRY; // rows 1 and 21 → pages 1 and 2
    await page.goto(`/admin/plans/${plan.id}/edit`);
    await expect(page.getByRole('heading', { name: 'Features', level: 3 })).toBeVisible();
    await expect(page.getByTestId('selected-count')).toHaveText(`0 of ${FEATURE_REGISTRY.length} selected`);
    for (const theme of ['cosmic', 'midnight'] as const) {
      await setTheme(page, creds, theme);
      await expectNoHorizontalOverflow(page);
      await screenshot(page, `matrix-${theme}`);
    }
    // Identity confirmation BEFORE the toggles: leaving the page afterwards
    // would remount the client matrix and reset its (unsaved) enabled set.
    await reauth(page, creds);
    await page.goto(`/admin/plans/${plan.id}/edit`);
    await page.getByRole('checkbox', { name: `Toggle ${first.name}` }).click();
    await expect(page.getByTestId('selected-count')).toHaveText(`1 of ${FEATURE_REGISTRY.length} selected`);
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('checkbox', { name: `Toggle ${second.name}` }).click();
    await expect(page.getByTestId('selected-count')).toHaveText(`2 of ${FEATURE_REGISTRY.length} selected`);
    // Cross-page tray + selected-only filter (a checkbox label, not a button).
    await expect(tray(page).getByText(second.name)).toBeVisible();
    await page.getByRole('checkbox', { name: 'Selected only' }).check();
    // The counter's "N of M" is truthful for the ACTIVE view: selected-only
    // shows 2 rows, so M is 2 (the same rule the committed search counter
    // follows on the catalog surfaces).
    await expect(page.getByTestId('selected-count')).toHaveText('2 of 2 selected');
    await expect(page.getByRole('checkbox', { name: `Toggle ${second.name}` })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Toggle ${first.name}` })).toBeVisible();
    await screenshot(page, 'matrix-selected-tray');
    await page.getByRole('checkbox', { name: 'Selected only' }).uncheck();
    // We are still on matrix page 2 — save from here: the submit must
    // reconstruct the complete enabled set (the visual page is irrelevant).
    // The dispatch is asynchronous: synchronize on the action's POST response
    // (the transaction commits before it returns), then read the database.
    const firstSave = page.waitForResponse(response => response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save matrix' }).click();
    expect((await firstSave).status()).toBe(200);
    // Scoped to the matrix section: Next.js's route announcer is an (empty)
    // body-level alert that is not ours to count.
    await expect(matrixAlerts(page)).toHaveCount(0);
    await expect.poll(async () => prisma.featurePlanTranslation.findMany({ where: { planId: plan.id, enabled: true }, select: { feature: { select: { key: true } } } })
      .then(rows => rows.map(row => row.feature.key).sort()))
      .toEqual([first.key, second.key].sort());
    await expect.poll(async () => prisma.adminAudit.count({ where: {
      actorId: creds.userId, action: 'plan.features', targetId: plan.id,
      reason: `Saved feature matrix for plan ${plan.name} (2 of ${FEATURE_REGISTRY.length} enabled)`,
    } })).toBe(1);
    // The saved set is exactly the two enabled keys — one from each page.
    expect(await prisma.featurePlanTranslation.count({ where: { planId: plan.id } })).toBe(2);
  });

  test('matrix is keyboard operable: Tab reaches a toggle and Space flips it', async ({ page }) => {
    keyboardDesktopOnly();
    const plan = await seedPlan({ name: `${PREFIX}Matrix Keyboard` });
    await page.goto(`/admin/plans/${plan.id}/edit`);
    // Target the first RENDERED matrix toggle (grouped category order): the
    // matrix rows are the shared list's real checkboxes (input, not button),
    // and the builder page's plan-details flags must not be mistaken for one.
    const label = await page.getByRole('checkbox', { name: /^Toggle / }).first().getAttribute('aria-label');
    expect(label).toBeTruthy();
    await tabTo(page, { role: 'checkbox', name: label! }, 60);
    // A native input checkbox flips on Space — Enter is inert on it by spec
    // (buttons flip on Enter; form checkboxes flip on Space).
    await page.keyboard.press(' ');
    await expect(page.getByTestId('selected-count')).toHaveText(`1 of ${FEATURE_REGISTRY.length} selected`);
  });
});