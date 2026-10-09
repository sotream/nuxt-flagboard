import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests import the core package from source, so they do not need `pnpm build` in packages/core first.
  resolve: {
    alias: {
      '@flagboard/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
