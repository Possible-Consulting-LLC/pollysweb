import { mkdirSync } from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import { readCreds, resetRateLimits } from './lib/db';

/**
 * Signs in through the REAL login UI (server-action form → Auth.js credentials
 * provider) and persists the session for every engine/viewport project. No
 * session cookies are ever written by hand — this is the ordinary UI flow.
 */
const STATE_PATH = 'tests/integration/.auth/state.json';

setup('sign in through the real login form', async ({ page }) => {
  const creds = readCreds();
  await resetRateLimits(creds.userId, creds.email);
  await page.goto('/login');
  const form = page.getByRole('button', { name: 'Sign in' });
  await expect(form).toBeVisible();
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await form.click();
  // loginAction redirects to /home on success.
  await page.waitForURL('**/home');
  // Sanity: the seeded super_admin passes readActor and reaches the admin area.
  await page.goto('/admin/plans');
  await expect(page.getByRole('heading', { name: 'Plans', level: 2 })).toBeVisible();
  mkdirSync('tests/integration/.auth', { recursive: true });
  await page.context().storageState({ path: STATE_PATH });
});