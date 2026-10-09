import { defineConfig } from 'vitest/config';
import { coreAlias } from './vitest.alias.js';

export default defineConfig({
  resolve: { alias: coreAlias },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    env: { APP_ENV: 'dev' },
  },
});
