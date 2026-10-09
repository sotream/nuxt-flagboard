import { fileURLToPath } from 'node:url';

/** Tests import the core package from source, so they do not need `pnpm build` in packages/core first. */
export const coreAlias = {
  '@flagboard/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
};
