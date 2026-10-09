import { describe, expect, it } from 'vitest';
import { E2E_RUN_LOCK_KEY, connectForRunLock } from './helpers/run-lock.js';

describe('e2e run lock', () => {
  it('is held by the running suite, so a second run would have to wait', async () => {
    const other = connectForRunLock();
    await other.connect();
    try {
      const { rows } = await other.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [E2E_RUN_LOCK_KEY],
      );
      expect(rows[0]?.acquired).toBe(false);
    } finally {
      await other.end();
    }
  });
});
