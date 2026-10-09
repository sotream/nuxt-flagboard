import { fileURLToPath } from 'node:url';

/** Tests import the core and sdk packages from source, so they do not need `pnpm build` first. */
export const coreAlias = {
  '@flagboard/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
  '@flagboard/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
};
