import { defineConfig } from '@playwright/test';

// Browser tests run against the production build served by server.mjs (same headers as Vercel).
// PLAYWRIGHT_BASE_URL runs the same suite against a deployed site instead.
const remoteURL = process.env.PLAYWRIGHT_BASE_URL;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome';
if (!['chrome', 'chromium'].includes(browserChannel)) {
  throw new Error('PLAYWRIGHT_BROWSER_CHANNEL must be chrome or chromium.');
}

export default defineConfig({
  testDir: 'tests',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    channel: browserChannel,
    baseURL: remoteURL || 'http://127.0.0.1:4180',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: remoteURL
    ? undefined
    : {
        command: 'npm start',
        url: 'http://127.0.0.1:4180',
        reuseExistingServer: !process.env.CI,
      },
  workers: 1,
});
