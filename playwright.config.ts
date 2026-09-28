import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright integration suite for the creator surfaces.
 *
 * Timing + rendering run against a PRODUCTION build served by `next start`
 * (tests/integration/serve.sh) — never dev-server timings, which compile on
 * demand and are documented as noise in the performance report. The server
 * speaks plain HTTP on a loopback port, so AUTH_URL is pinned to it to keep
 * every cookie (session, admin reauth proof) non-secure, exactly as the app
 * computes them from the configured origin.
 */
const PORT = 43901;
const baseURL = `http://localhost:${PORT}`;
const STATE = 'tests/integration/.auth/state.json';

export default defineConfig({
  testDir: 'tests/integration',
  outputDir: 'tests/integration/artifacts/run',
  globalSetup: './tests/integration/global-setup.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  // The staging database is shared with live traffic; transient contention is
  // absorbed by retries, never by weakened assertions.
  retries: 2,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Baselines are committed per engine/viewport project; drift fails the run.
      pathTemplate: 'tests/integration/artifacts/baselines/{projectName}/{testFileName}/{arg}{ext}',
      animations: 'disabled',
      caret: 'hide',
    },
  },
  reporter: [['list'], ['html', { outputFolder: 'tests/integration/artifacts/report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bash tests/integration/serve.sh',
    url: `${baseURL}/api/health`,
    timeout: 900_000,
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, AUTH_URL: baseURL },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium-desktop',
      dependencies: ['setup'],
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STATE },
    },
    {
      name: 'chromium-mobile',
      dependencies: ['setup'],
      testIgnore: /perf\.spec\.ts/,
      // Explicit browserName: devices['iPhone 13'] carries
      // defaultBrowserType: 'webkit', so without this the "chromium-mobile"
      // project silently ran WebKit — its captures were byte-identical to
      // webkit-mobile's and the engine matrix claimed by the plan (Chromium +
      // WebKit) was half illusion.
      use: { ...devices['iPhone 13'], browserName: 'chromium', storageState: STATE },
    },
    {
      name: 'webkit-desktop',
      dependencies: ['setup'],
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Desktop Safari'], storageState: STATE },
    },
    {
      name: 'webkit-mobile',
      dependencies: ['setup'],
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'webkit', storageState: STATE },
    },
    {
      // Production-build timing runs (performance addendum) — Chromium only.
      name: 'perf',
      dependencies: ['setup'],
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STATE },
    },
  ],
});