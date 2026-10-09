import { describe, expect, it } from 'vitest';
import { matchesRule } from './rules.js';
import type { Rule } from './types.js';

const rule = (conditions: Rule['conditions']): Rule => ({ conditions, serve: 'on' });

describe('matchesRule', () => {
  it('matches equals on an identical value', () => {
    const r = rule([{ attribute: 'country', operator: 'equals', value: 'UA' }]);
    expect(matchesRule(r, { attributes: { country: 'UA' } })).toBe(true);
  });

  it('does not match equals on a different value', () => {
    const r = rule([{ attribute: 'country', operator: 'equals', value: 'UA' }]);
    expect(matchesRule(r, { attributes: { country: 'DE' } })).toBe(false);
  });

  it('compares types strictly: the string "1" does not equal the number 1', () => {
    const r = rule([{ attribute: 'tier', operator: 'equals', value: 1 }]);
    expect(matchesRule(r, { attributes: { tier: '1' } })).toBe(false);
    expect(matchesRule(r, { attributes: { tier: 1 } })).toBe(true);
  });

  it('compares booleans strictly: "true" is not true', () => {
    const r = rule([{ attribute: 'beta', operator: 'equals', value: true }]);
    expect(matchesRule(r, { attributes: { beta: 'true' } })).toBe(false);
    expect(matchesRule(r, { attributes: { beta: true } })).toBe(true);
  });

  it('matches in when the value is one of the listed values', () => {
    const r = rule([{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }]);
    expect(matchesRule(r, { attributes: { plan: 'team' } })).toBe(true);
    expect(matchesRule(r, { attributes: { plan: 'free' } })).toBe(false);
  });

  it('never matches in with an empty list', () => {
    const r = rule([{ attribute: 'plan', operator: 'in', values: [] }]);
    expect(matchesRule(r, { attributes: { plan: 'pro' } })).toBe(false);
  });

  it('uses strict comparison inside in: the number 1 is not in ["1"]', () => {
    const r = rule([{ attribute: 'tier', operator: 'in', values: ['1'] }]);
    expect(matchesRule(r, { attributes: { tier: 1 } })).toBe(false);
  });

  it('requires every condition to match (AND)', () => {
    const r = rule([
      { attribute: 'country', operator: 'equals', value: 'UA' },
      { attribute: 'plan', operator: 'in', values: ['pro'] },
    ]);
    expect(matchesRule(r, { attributes: { country: 'UA', plan: 'pro' } })).toBe(true);
    expect(matchesRule(r, { attributes: { country: 'UA', plan: 'free' } })).toBe(false);
  });

  it('does not match when the attribute is missing or there are no attributes', () => {
    const r = rule([{ attribute: 'country', operator: 'equals', value: 'UA' }]);
    expect(matchesRule(r, { attributes: {} })).toBe(false);
    expect(matchesRule(r, {})).toBe(false);
  });

  it('ignores inherited properties, so "constructor" or "__proto__" is not an attribute', () => {
    const r = rule([{ attribute: 'constructor', operator: 'in', values: ['x'] }]);
    expect(matchesRule(r, { attributes: {} })).toBe(false);
  });

  it('never matches a rule without conditions', () => {
    expect(matchesRule(rule([]), { attributes: { a: 1 } })).toBe(false);
  });
});
