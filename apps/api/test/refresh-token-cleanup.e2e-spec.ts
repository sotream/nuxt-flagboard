import { Role } from '../src/common/enums/role.enum.js';
import {
  REFRESH_CLEANUP_BATCH_SIZE,
  RefreshTokenCleanupService,
} from '../src/modules/auth/refresh-token-cleanup.service.js';
import { unique } from './helpers/app-role.js';
import { createTestApp, createUser } from './helpers/test-app.js';
import type { TestApp } from './helpers/test-app.js';

let t: TestApp;
let cleanup: RefreshTokenCleanupService;
let userId: string;

beforeAll(async () => {
  t = await createTestApp({
    env: { REFRESH_TOKEN_TTL_DAYS: '7', REFRESH_REVOKED_RETENTION_DAYS: '14' },
  });
  cleanup = t.app.get(RefreshTokenCleanupService);
  userId = (await createUser(t.dataSource, Role.Viewer)).id;
});

afterAll(async () => {
  await t.close();
});

async function insertToken(expires: string, revokedAgo: string | null): Promise<string> {
  const hash = `cleanup-${unique()}`;
  await t.dataSource.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, revoked_at)
     VALUES ($1, gen_random_uuid(), $2, now() + $3::interval, now() - $4::interval)`,
    [userId, hash, expires, revokedAgo],
  );
  return hash;
}

const exists = async (hash: string): Promise<boolean> =>
  (await t.dataSource.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [hash]))
    .length === 1;

describe('RefreshTokenCleanupService.purge', () => {
  it('removes expired tokens and revoked tokens past the retention, and keeps the rest', async () => {
    const active = await insertToken('1 day', null);
    const expired = await insertToken('-1 hour', null);
    const revokedRecently = await insertToken('1 day', '1 day'); // still needed for reuse detection
    const revokedLongAgo = await insertToken('1 day', '15 days'); // beyond the 14-day retention

    await cleanup.purge();

    expect(await exists(active)).toBe(true);
    expect(await exists(revokedRecently)).toBe(true);
    expect(await exists(expired)).toBe(false);
    expect(await exists(revokedLongAgo)).toBe(false);
  });

  it('works through more rows than one batch', async () => {
    const total = REFRESH_CLEANUP_BATCH_SIZE * 2 + 5;
    await t.dataSource.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
       SELECT $1, gen_random_uuid(), 'bulk-${unique()}-' || n, now() - interval '1 day'
       FROM generate_series(1, $2) AS n`,
      [userId, total],
    );

    expect(await cleanup.purge()).toBe(total);
  });

  it('removes nothing when there is nothing to remove', async () => {
    await cleanup.purge();
    expect(await cleanup.purge()).toBe(0);
  });
});
