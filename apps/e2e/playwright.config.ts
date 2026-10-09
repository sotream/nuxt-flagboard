import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Local runs read the repository `.env` (the same file the API reads); CI sets the variables itself. Variables
// that are already set win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const webPort = '3010'; // fixed in apps/web/nuxt.config.ts
const webUrl = `http://localhost:${webPort}`;
const apiPort = process.env.PORT ?? '4010';

export default defineConfig({
  testDir: './tests',
  // One flow, one worker: the test creates data in a shared database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // The compiled API, so the test runs what ships. Needs `pnpm build`, a migrated database and the seed.
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // `nuxt dev` rather than the built site, because its dev proxy forwards `/api/` and `/v1/` to the API, so the
      // browser sees one origin and the refresh cookie behaves as in production. The built site is static files;
      // its proxy is the nginx in the web image, which is checked separately (see docs/guides/testing.md).
      command: 'pnpm --filter web dev',
      // `PORT` in the repository `.env` is the API's port, and Nuxt would take it too.
      env: { PORT: webPort },
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
