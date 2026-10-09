import { describe, expect, it } from 'vitest';
import { REASONS } from './types.js';

describe('REASONS', () => {
  it('lists every reason of the evaluation contract exactly once', () => {
    expect([...REASONS].sort()).toEqual(
      [
        'DEFAULT',
        'DISABLED',
        'ERROR',
        'FLAG_NOT_FOUND',
        'KILL_SWITCH',
        'ROLLOUT_IN',
        'ROLLOUT_NO_USER_ID',
        'ROLLOUT_OUT',
        'RULE_MATCH',
      ].sort(),
    );
  });
});
