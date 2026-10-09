import { MIN_PASSWORD_LENGTH } from '../../../common/utils/password.js';

export interface SeedConfig {
  adminEmail: string;
  adminPassword: string;
  /** Optional: without it no viewer is created. */
  viewerEmail: string;
  viewerPassword?: string;
}

/**
 * Reads and checks the seed settings. The seed creates a known admin and a demo project, which is only safe on a
 * development machine, so it refuses to run with `APP_ENV=prod` and when `APP_ENV` is not set at all. The admin
 * password has no default anywhere in the repository: it must come from the environment.
 */
export function readSeedConfig(env: Record<string, string | undefined>): SeedConfig {
  if (env.APP_ENV !== 'dev') {
    throw new Error('The seed only runs with APP_ENV=dev. It creates a known admin account.');
  }
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD is required (at least ${MIN_PASSWORD_LENGTH} characters). Set it in .env.`,
    );
  }
  const viewerPassword = env.SEED_VIEWER_PASSWORD || undefined;
  if (viewerPassword !== undefined && viewerPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_VIEWER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters when set.`,
    );
  }
  return {
    adminEmail: (env.SEED_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    adminPassword,
    viewerEmail: (env.SEED_VIEWER_EMAIL || 'viewer@example.com').trim().toLowerCase(),
    viewerPassword,
  };
}
