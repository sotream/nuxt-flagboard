import { defineConfig } from 'vitest/config';
import { loadRootEnv } from './src/infrastructure/config/load-env.js';
import { toTestDatabaseUrl } from './test/helpers/test-database-url.js';

loadRootEnv();

const { DATABASE_URL, MIGRATOR_DATABASE_URL } = process.env;
if (!DATABASE_URL || !MIGRATOR_DATABASE_URL) {
  throw new Error(
    'DATABASE_URL and MIGRATOR_DATABASE_URL are required for e2e tests (see .env.example)',
  );
}

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/global-setup.ts'],
    // Tests share one database, so files run one after another.
    fileParallelism: false,
    env: {
      APP_ENV: 'dev',
      LOG_LEVEL: 'silent',
      DATABASE_URL: toTestDatabaseUrl(DATABASE_URL),
      MIGRATOR_DATABASE_URL: toTestDatabaseUrl(MIGRATOR_DATABASE_URL),
    },
  },
});
