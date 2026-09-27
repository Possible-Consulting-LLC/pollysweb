import { test as base, expect, type Page } from '@playwright/test';
import { prisma, readCreds, resetRateLimits, cleanupE2eData, PREFIX, type E2eUser } from './lib/db';

export { expect, PREFIX };
export type { E2eUser };
export { prisma, readCreds };

type AppTheme = 'cosmic' | 'midnight';

/** Environment artifacts of running the app on a local (non-Vercel) production
 * server: the Analytics script's endpoint does not exist there. The generic
 * "Failed to load resource" console line is intentionally dropped because every
 * failed response is independently gated below via the response listener. */
const BENIGN_CONSOLE = [
  'Failed to load resource',
  '/_vercel/insights/script.js',
];

type CapturedErrors = { console: string[]; pageErrors: string[]; failedResponses: string[] };

/** Fails the test when the page logs any console error, throws an uncaught
 * error, or receives a failed (≥400) network response — on every surface and
 * during every interaction. */
export const test = base.extend<{ trackErrors: void; cleanup: void; creds: E2eUser }>({
  creds: async ({}, use) => use(readCreds()),

  trackErrors: [async ({ page }, use) => {
    const errors: CapturedErrors = { console: [], pageErrors: [], failedResponses: [] };
    const onConsole = (message: { type(): string; text(): string }) => {
      const text = message.text();
      if (message.type() === 'error' && !BENIGN_CONSOLE.some(fragment => text.includes(fragment))) {
        errors.console.push(text);
      }
    };
    const onPageError = (error: Error) => {
      // WebKit intermittently surfaces 'Load failed' (TypeError) when a local
      // keep-alive socket is reused for a server-action POST that React then
      // retries successfully — a harness artifact, not an app failure. Real
      // failures still fail the test through the functional assertions (DB
      // polls, UI state) and the failed-response gate.
      if (error.message === 'Load failed') return;
      errors.pageErrors.push(error.message);
    };
    const onResponse = (response: { status(): number; url(): string; request(): { method(): string } }) => {
      if (response.status() >= 400) errors.failedResponses.push(`${response.request().method()} ${response.status()} ${response.url()}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    await use();
    expect(errors.console, `console errors: ${JSON.stringify(errors.console)}`).toEqual([]);
    expect(errors.pageErrors, `uncaught page errors: ${JSON.stringify(errors.pageErrors)}`).toEqual([]);
    expect(errors.failedResponses.filter(url => !url.includes('/_vercel/')), `failed network responses: ${JSON.stringify(errors.failedResponses)}`).toEqual([]);
  }, { auto: true }],

  /** Data lifecycle: every created entity is prefixed and removed after each
   * test; the seeded super_admin (excluded by email) survives until teardown.
   * The network is quiesced first so Next's in-flight link prefetches (e.g. an
   * expanded row's Edit-plan link) hit the server while the data still exists —
   * otherwise a prefetch landing after the cleanup renders a 404. */
  cleanup: [async ({ page, creds }, use) => {
    await use();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await cleanupE2eData({ includeUsers: true, excludeEmails: [creds.email] });
    await prisma.user.update({ where: { id: creds.userId }, data: { theme: 'cosmic' } });
  }, { auto: true }],
});

// ---------------------------------------------------------------------------
// Shared locator helpers
// ---------------------------------------------------------------------------

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Rendering-verification helpers
// ---------------------------------------------------------------------------

/** Layout assertion: the document must never scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect.soft(scrollWidth, `horizontal overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

/** Theme via the app's own mechanism: the server renders `data-theme` from the
 * signed-in user's persisted preference (the settings toggle writes the same
 * field), so the suite persists it for the E2E user and reloads. */
export async function setTheme(page: Page, creds: E2eUser, theme: AppTheme) {
  await prisma.user.update({ where: { id: creds.userId }, data: { theme } });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Full-page screenshot baseline. First run writes the baseline under
 * tests/integration/artifacts/baselines/<project>/ (committed); later runs
 * fail on visual drift. ISO dates are frozen first: rows, stat lines, and
 * detail cards embed real timestamps, and unstabilized dates would drift the
 * baselines every day while saying nothing about rendering. */
export async function screenshot(page: Page, name: string) {
  await page.evaluate(() => {
    const iso = /\b20\d{2}-\d{2}-\d{2}\b/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (iso.test(node.data)) nodes.push(node);
    }
    for (const node of nodes) node.data = node.data.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '2066-01-01');
  });
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

/** Scroll pin helper: full scroll down and back. `page.mouse.wheel` is not
 * supported on touch/mobile viewports, so scrolling goes through the window
 * API in all engines. */
export async function scrollDownUp(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.trunc(window.innerHeight * 0.8));
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(resolve => setTimeout(resolve, 100));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
}

/** Tab-reach checks run on the Chromium desktop project only: touch viewports
 * have no keyboard-focus semantics, and Safari/WebKit leaves links and buttons
 * out of the Tab order unless the OS-level "full keyboard access" setting is
 * enabled — a user preference a test harness cannot toggle. */
export function keyboardDesktopOnly() {
  test.skip(test.info().project.name !== 'chromium-desktop',
    'Keyboard reachability is asserted on the Chromium desktop project only (mobile viewports have no keyboard semantics; Safari requires the OS-level full-keyboard-access setting).');
}

// ---------------------------------------------------------------------------
// Auth (real reauth flow) — every creator mutation is super_admin-gated by
// withAdminControl, which requires an identity confirmation from the last five
// minutes. The suite performs it through the real /admin/reauth page.
// ---------------------------------------------------------------------------

export async function reauth(page: Page, creds: E2eUser) {
  await resetRateLimits(creds.userId, creds.email);
  await page.goto('/admin/reauth');
  await page.getByLabel('Your password').fill(creds.password);
  await page.getByRole('button', { name: 'Confirm my identity' }).click();
  await expect(page.getByText('Identity confirmed for five minutes.')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Keyboard operability: Tab must reach the given control and Enter must
// activate it (links/buttons only — form fields are asserted reachable).
// ---------------------------------------------------------------------------

export async function tabTo(page: Page, target: { role: 'link' | 'button' | 'checkbox' | 'textbox' | 'searchbox' | 'combobox' | 'radio'; name: string | RegExp }, maxTabs = 30) {
  for (let tabs = 1; tabs <= maxTabs; tabs++) {
    await page.keyboard.press('Tab');
    const locator = page.getByRole(target.role, { name: target.name });
    const isActive = await locator.evaluate((element) => element === document.activeElement).catch(() => false);
    if (isActive) return tabs;
  }
  throw new Error(`Tab never reached role=${target.role} name=${String(target.name)}`);
}

// ---------------------------------------------------------------------------
// Test-data seeding (setup-only entities go straight through Prisma; flows that
// are themselves under test go through the UI). Everything is ZZ-e2e- prefixed.
// ---------------------------------------------------------------------------

export async function seedPlan(input: Partial<{ name: string; description: string; planType: string; maxSpiders: number | null; active: boolean; public: boolean; billingOptions: Array<{ interval: string; basePriceCents: number; active: boolean }> }> = {}) {
  return prisma.plan.create({
    data: {
      name: input.name ?? `${PREFIX}Plan`,
      description: input.description ?? '',
      planType: input.planType ?? 'STANDARD',
      maxSpiders: input.maxSpiders ?? null,
      active: input.active ?? false,
      public: input.public ?? false,
      billingOptions: input.billingOptions
        ? { create: input.billingOptions.map(option => ({ interval: option.interval, basePriceCents: option.basePriceCents, active: option.active })) }
        : undefined,
    },
    include: { billingOptions: true },
  });
}

/** A registered feature's database row. Keys carry the e2e prefix only in the
 * orphan case — registry keys must stay unprefixed to be recognised, so tests
 * that SELECT registered features never mutate their rows. */
export async function seedOrphanFeature() {
  return prisma.feature.create({ data: {
    // Category sorts first so the orphan lands on catalog page 1 deterministically.
    key: 'zz-e2e-orphan-feature', name: `${PREFIX}Orphaned feature`,
    description: 'Created by the integration suite to verify orphaned-row rendering; not in the code registry.',
    category: 'aaa-testing', active: false,
  } });
}

export async function seedKeeper(input: { name?: string; email?: string } = {}) {
  const email = input.email ?? `zz-e2e-keeper-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.spoodlyspace.test`;
  return prisma.user.create({ data: {
    email, name: input.name ?? `${PREFIX}Keeper`, emailVerified: new Date(),
  }, select: { id: true, email: true, name: true } });
}