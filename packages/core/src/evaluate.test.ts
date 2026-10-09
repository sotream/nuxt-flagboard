import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.js';
import { bucket } from './bucket.js';
import type { FlagConfig, Rule } from './types.js';

const SALT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function flag(overrides: Partial<FlagConfig> = {}): FlagConfig {
  return {
    key: 'new-checkout',
    type: 'string',
    onValue: 'new',
    offValue: 'old',
    salt: SALT,
    enabled: true,
    rolloutPercentage: 0,
    rules: [],
    killSwitch: false,
    ...overrides,
  };
}

const ukraine: Rule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
  serve: 'on',
};
const germanyOff: Rule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'DE' }],
  serve: 'off',
};

// user-1 is in bucket 2999 and user-2 in 5901 for SALT (see bucket.test.ts).
describe('evaluate', () => {
  describe('unknown flag', () => {
    it('returns the caller default with FLAG_NOT_FOUND', () => {
      expect(evaluate(undefined, {}, 'fallback')).toEqual({
        value: 'fallback',
        reason: 'FLAG_NOT_FOUND',
      });
    });
  });

  describe('step 1: kill switch', () => {
    it('serves the off value with KILL_SWITCH', () => {
      expect(evaluate(flag({ killSwitch: true }), {}, 'x')).toEqual({
        value: 'old',
        reason: 'KILL_SWITCH',
      });
    });

    it('wins over enabled, a matching rule and a 100% rollout', () => {
      const f = flag({ killSwitch: true, enabled: true, rules: [ukraine], rolloutPercentage: 100 });
      expect(evaluate(f, { userId: 'user-1', attributes: { country: 'UA' } }, 'x').reason).toBe(
        'KILL_SWITCH',
      );
    });
  });

  describe('step 2: enabled', () => {
    it('serves the off value with DISABLED', () => {
      expect(evaluate(flag({ enabled: false }), {}, 'x')).toEqual({
        value: 'old',
        reason: 'DISABLED',
      });
    });

    it('wins over a matching rule and a 100% rollout', () => {
      const f = flag({ enabled: false, rules: [ukraine], rolloutPercentage: 100 });
      expect(evaluate(f, { userId: 'user-1', attributes: { country: 'UA' } }, 'x').reason).toBe(
        'DISABLED',
      );
    });
  });

  describe('step 3: rules', () => {
    it('serves the on value and reports the rule index', () => {
      const f = flag({ rules: [germanyOff, ukraine] });
      expect(evaluate(f, { attributes: { country: 'UA' } }, 'x')).toEqual({
        value: 'new',
        reason: 'RULE_MATCH',
        ruleIndex: 1,
      });
    });

    it('can serve the off value', () => {
      const f = flag({ rules: [germanyOff], rolloutPercentage: 100 });
      expect(evaluate(f, { attributes: { country: 'DE' } }, 'x')).toEqual({
        value: 'old',
        reason: 'RULE_MATCH',
        ruleIndex: 0,
      });
    });

    it('lets the first matching rule win', () => {
      const first: Rule = {
        conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
        serve: 'off',
      };
      const second: Rule = {
        conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
        serve: 'on',
      };
      expect(
        evaluate(flag({ rules: [first, second] }), { attributes: { plan: 'pro' } }, 'x'),
      ).toMatchObject({
        value: 'old',
        ruleIndex: 0,
      });
    });

    it('wins over rollout, so a rule match works without a userId', () => {
      const f = flag({ rules: [ukraine], rolloutPercentage: 50 });
      expect(evaluate(f, { attributes: { country: 'UA' } }, 'x').reason).toBe('RULE_MATCH');
    });

    it('falls through to rollout when no rule matches', () => {
      const f = flag({ rules: [ukraine], rolloutPercentage: 100 });
      expect(evaluate(f, { attributes: { country: 'PL' } }, 'x').reason).toBe('ROLLOUT_IN');
    });
  });

  describe('step 4: rollout', () => {
    it('serves the on value to everyone at 100%, even without a userId', () => {
      expect(evaluate(flag({ rolloutPercentage: 100 }), {}, 'x')).toEqual({
        value: 'new',
        reason: 'ROLLOUT_IN',
      });
    });

    it('serves the default off value to everyone at 0%', () => {
      expect(evaluate(flag({ rolloutPercentage: 0 }), { userId: 'user-1' }, 'x')).toEqual({
        value: 'old',
        reason: 'DEFAULT',
      });
    });

    it('does not apply a partial rollout without a userId', () => {
      expect(evaluate(flag({ rolloutPercentage: 50 }), {}, 'x')).toEqual({
        value: 'old',
        reason: 'ROLLOUT_NO_USER_ID',
      });
    });

    it('treats an empty userId as missing', () => {
      expect(evaluate(flag({ rolloutPercentage: 50 }), { userId: '' }, 'x').reason).toBe(
        'ROLLOUT_NO_USER_ID',
      );
    });

    it('puts a user in when their bucket is below the threshold', () => {
      // user-1 is in bucket 2999; 30% means buckets 0..2999.
      expect(bucket(SALT, 'user-1')).toBe(2999);
      expect(evaluate(flag({ rolloutPercentage: 30 }), { userId: 'user-1' }, 'x')).toEqual({
        value: 'new',
        reason: 'ROLLOUT_IN',
      });
    });

    it('keeps a user out when their bucket is at or above the threshold', () => {
      // 29% means buckets 0..2899, so bucket 2999 is out.
      expect(evaluate(flag({ rolloutPercentage: 29 }), { userId: 'user-1' }, 'x')).toEqual({
        value: 'old',
        reason: 'ROLLOUT_OUT',
      });
    });

    it('treats a non-finite percentage as 0', () => {
      expect(
        evaluate(flag({ rolloutPercentage: Number.NaN }), { userId: 'user-1' }, 'x').reason,
      ).toBe('DEFAULT');
    });
  });

  describe('step 5: default', () => {
    it('serves the off value with DEFAULT when nothing else applies', () => {
      expect(evaluate(flag(), { userId: 'user-1' }, 'x')).toEqual({
        value: 'old',
        reason: 'DEFAULT',
      });
    });
  });

  describe('flag types', () => {
    it('serves booleans for a boolean flag', () => {
      const f = flag({ type: 'boolean', onValue: true, offValue: false, rolloutPercentage: 100 });
      expect(evaluate(f, {}, false).value).toBe(true);
      expect(evaluate({ ...f, enabled: false }, {}, true).value).toBe(false);
    });
  });
});
