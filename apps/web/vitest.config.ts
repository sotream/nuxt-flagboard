import { defineConfig } from 'vitest/config';
import { defineVitestProject } from '@nuxt/test-utils/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Plain TypeScript: session handling, parsing, diffing. No Nuxt, no DOM, fast.
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      // Components and composables, running inside a real Nuxt app with a DOM.
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
        },
      }),
    ],
  },
});
