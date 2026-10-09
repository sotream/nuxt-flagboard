import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the repository-root `.env` into `process.env` for local runs. Variables that are already set win,
 * so CI and containers can override the file. A missing file is fine: production sets real variables.
 */
export function loadRootEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, '../../../../../.env');
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}
