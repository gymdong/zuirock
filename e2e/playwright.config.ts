import { defineConfig, devices } from '@playwright/test';

// Local: against `http://localhost:3000` (server serving the web export). Deployed: E2E_TARGET=deployed
// uses PUBLIC_ORIGIN (pnpm e2e:deployed). The guest runs as an iPhone-sized Safari-like context.
const deployed = process.env.E2E_TARGET === 'deployed';
const baseURL = deployed ? (process.env.PUBLIC_ORIGIN ?? '') : (process.env.E2E_BASE_URL ?? 'http://localhost:3000');

if (deployed && !baseURL) throw new Error('E2E_TARGET=deployed requires PUBLIC_ORIGIN');

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: deployed ? 120_000 : 60_000,
  expect: { timeout: deployed ? 30_000 : 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'guest-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'member-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
