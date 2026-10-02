import { expect, test, screenshot } from './fixtures';
import type { Page } from '@playwright/test';

/** Public marketing surface: rendering verification for every public route
 * (chrome present, no console errors, baselines × engine × viewport) against
 * an ANONYMOUS visitor — public pages must look right before sign-in. The
 * signed-in storage state is opted out for this file: /, /login and /register
 * redirect keepers into the app, and pricing CTAs would flip to upgrade mode.
 * /help is intentionally absent: it exists but is unlisted until its content
 * pass (see plan ledger). */

test.use({ storageState: undefined });

const routes: Array<{ path: string; name: string; heading: RegExp }> = [
  { path: '/', name: 'public-home', heading: /A Happier Home/ },
  { path: '/features', name: 'public-features', heading: /All the Tools/ },
  { path: '/care-guides', name: 'public-care-guides', heading: /Care Guides for Every Step/ },
  { path: '/care-guides/feeding', name: 'public-guide-feeding', heading: /Feeding Guide/ },
  { path: '/blog', name: 'public-blog', heading: /^Blog$/ },
  { path: '/blog/welcome-to-pollys-web', name: 'public-blog-welcome', heading: /Welcome to Polly's Web/ },
  { path: '/pricing', name: 'public-pricing', heading: /Simple Pricing for Every Spood Parent/ },
  { path: '/about', name: 'public-about', heading: /About Polly's Web/ },
  { path: '/contact', name: 'public-contact', heading: /We'd love to/ },
  { path: '/legal', name: 'public-legal-hub', heading: /Transparency Builds a Brighter Web/ },
  { path: '/legal/terms-of-service', name: 'public-legal-terms', heading: /Terms of Service/ },
  { path: '/login', name: 'public-login', heading: /Good to see you!/ },
  { path: '/register', name: 'public-register', heading: /Polly's Web/ },
];

test.describe('public marketing rendering', () => {
  test('every public route renders chrome without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    for (const route of routes) {
      await page.goto(route.path);
      // Shared chrome: primary nav + site footer on every public page.
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeVisible();
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
      await expect(page).toHaveNoConsoleErrors(consoleErrors, route.path);
      await screenshot(page, route.name);
    }
  });
});