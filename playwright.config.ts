import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 120_000 : 60_000,
  // CI runners are slow shared machines; interaction timing occasionally flakes.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'pnpm --filter @map-engine/demo dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'large', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
