import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.js';
import { REASONS } from './types.js';
import type { AttributeValue, Condition, Context, FlagConfig, Rule } from './types.js';

// Fixed seed and run count: the same inputs every time, so a failure is reproducible and never flaky.
const RUNS = { seed: 20261009, numRuns: 500 };

const salt = fc.stringMatching(/^[0-9a-f]{32}$/);
const attributeValue: fc.Arbitrary<AttributeValue> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
);
const condition: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({
    attribute: fc.constantFrom('country', 'plan', 'tier'),
    operator: fc.constant('equals' as const),
    value: attributeValue,
  }),
  fc.record({
    attribute: fc.constantFrom('country', 'plan', 'tier'),
    operator: fc.constant('in' as const),
    values: fc.array(attributeValue, { maxLength: 4 }),
  }),
);
const rule: fc.Arbitrary<Rule> = fc.record({
  conditions: fc.array(condition, { maxLength: 3 }),
  serve: fc.constantFrom('on' as const, 'off' as const),
});
const flagConfig: fc.Arbitrary<FlagConfig> = fc.record({
  key: fc.constant('flag'),
  type: fc.constant('string' as const),
  onValue: fc.constant('on'),
  offValue: fc.constant('off'),
  salt,
  enabled: fc.boolean(),
  rolloutPercentage: fc.integer({ min: 0, max: 100 }),
  rules: fc.array(rule, { maxLength: 4 }),
  killSwitch: fc.boolean(),
});
// Anything that can arrive as JSON, including values our types forbid: evaluation must still not throw.
const hostileContext = fc.record(
  {
    userId: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
    attributes: fc.oneof(
      fc.dictionary(fc.string(), fc.jsonValue()),
      fc.constant(null),
      fc.string(),
      fc.integer(),
    ),
  },
  { requiredKeys: [] },
) as unknown as fc.Arbitrary<Context>;
const context: fc.Arbitrary<Context> = fc.record(
  {
    userId: fc.string(),
    attributes: fc.dictionary(fc.constantFrom('country', 'plan', 'tier'), attributeValue),
  },
  { requiredKeys: [] },
);

describe('evaluate properties', () => {
  it('is deterministic', () => {
    fc.assert(
      fc.property(flagConfig, context, (flag, ctx) => {
        expect(evaluate(flag, ctx, 'x')).toEqual(evaluate(flag, ctx, 'x'));
      }),
      RUNS,
    );
  });

  it('never throws on hostile context input', () => {
    fc.assert(
      fc.property(flagConfig, hostileContext, (flag, ctx) => {
        expect(() => evaluate(flag, ctx, 'x')).not.toThrow();
      }),
      RUNS,
    );
  });

  it('always lets the kill switch win', () => {
    fc.assert(
      fc.property(flagConfig, context, (flag, ctx) => {
        expect(evaluate({ ...flag, killSwitch: true }, ctx, 'x')).toEqual({
          value: 'off',
          reason: 'KILL_SWITCH',
        });
      }),
      RUNS,
    );
  });

  it('only returns known reasons and sets ruleIndex exactly for RULE_MATCH', () => {
    fc.assert(
      fc.property(flagConfig, context, (flag, ctx) => {
        const result = evaluate(flag, ctx, 'x');
        expect(REASONS).toContain(result.reason);
        expect(result.ruleIndex !== undefined).toBe(result.reason === 'RULE_MATCH');
      }),
      RUNS,
    );
  });

  it('only adds users when the percentage grows: nobody leaves a rollout', () => {
    fc.assert(
      fc.property(
        salt,
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (flagSalt, userId, a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          const base: FlagConfig = {
            key: 'flag',
            type: 'boolean',
            onValue: true,
            offValue: false,
            salt: flagSalt,
            enabled: true,
            rolloutPercentage: low,
            rules: [],
            killSwitch: false,
          };
          const wasIn = evaluate(base, { userId }, false).value;
          const isIn = evaluate({ ...base, rolloutPercentage: high }, { userId }, false).value;
          expect(wasIn && !isIn).toBe(false);
        },
      ),
      RUNS,
    );
  });
});

describe('rollout distribution', () => {
  const USERS = 100_000;
  // Tolerance: the share of users rolled in must be within one percentage point of the target. For 100 000
  // users the standard deviation is at most 0.16 points, so this is more than six standard deviations wide,
  // and the user ids are fixed, so the result never changes between runs.
  const TOLERANCE = 0.01;

  it.each([1, 10, 30, 50, 90, 99])('rolls in about %i%% of users', (percentage) => {
    const flag: FlagConfig = {
      key: 'flag',
      type: 'boolean',
      onValue: true,
      offValue: false,
      salt: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      enabled: true,
      rolloutPercentage: percentage,
      rules: [],
      killSwitch: false,
    };
    let rolledIn = 0;
    for (let i = 0; i < USERS; i++) {
      if (evaluate(flag, { userId: `user-${i}` }, false).value) rolledIn++;
    }
    expect(Math.abs(rolledIn / USERS - percentage / 100)).toBeLessThan(TOLERANCE);
  });
});
