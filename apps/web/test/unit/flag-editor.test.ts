import { describe, expect, it } from 'vitest';
import type { FlagEnvironmentView, Rule } from '../../app/utils/api-types';
import { changedFields, draftFrom, labelsOf, pick, sameValue } from '../../app/utils/flag-editor';

export const environment = (overrides: Partial<FlagEnvironmentView> = {}): FlagEnvironmentView => ({
  environment: 'dev',
  enabled: false,
  rolloutPercentage: 0,
  rules: [],
  killSwitch: false,
  killReason: null,
  revision: 1,
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});
const rule: Rule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
  serve: 'on',
};

describe('sameValue', () => {
  it('ignores the order of object keys, which the server and the UI may disagree on', () => {
    expect(sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it('keeps the order of array items, because rule order matters', () => {
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue([rule, { ...rule, serve: 'off' }], [{ ...rule, serve: 'off' }, rule])).toBe(
      false,
    );
  });

  it('tells apart values that merely look alike', () => {
    expect(sameValue(1, '1')).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue([], {})).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe('draftFrom', () => {
  it('copies the editable fields, and the copy is independent of the server state', () => {
    const server = environment({ enabled: true, rolloutPercentage: 40, rules: [rule] });
    const draft = draftFrom(server);

    expect(draft).toEqual({ enabled: true, rolloutPercentage: 40, rules: [rule] });
    draft.rules[0]!.serve = 'off';
    expect(server.rules[0]!.serve).toBe('on');
  });
});

describe('changedFields', () => {
  it('lists only the fields that differ', () => {
    const a = draftFrom(environment());
    expect(changedFields(a, a)).toEqual([]);
    expect(changedFields({ ...a, rolloutPercentage: 5 }, a)).toEqual(['rolloutPercentage']);
    expect(changedFields({ ...a, enabled: true, rules: [rule] }, a)).toEqual(['enabled', 'rules']);
  });

  it('does not report rules that are the same with their keys in another order', () => {
    const reordered: Rule = {
      serve: 'on',
      conditions: [{ value: 'UA', operator: 'equals', attribute: 'country' }],
    };
    expect(
      changedFields(
        { ...draftFrom(environment()), rules: [reordered] },
        { ...draftFrom(environment()), rules: [rule] },
      ),
    ).toEqual([]);
  });
});

describe('pick and labelsOf', () => {
  it('copies just the asked fields', () => {
    const draft = { enabled: true, rolloutPercentage: 10, rules: [rule] };
    const picked = pick(draft, ['rolloutPercentage', 'rules']);
    expect(picked).toEqual({ rolloutPercentage: 10, rules: [rule] });
    picked.rules![0]!.serve = 'off';
    expect(draft.rules[0]!.serve).toBe('on');
  });

  it('names fields for people', () => {
    expect(labelsOf(['enabled', 'rolloutPercentage', 'rules'])).toBe(
      'Enabled, Rollout, Targeting rules',
    );
  });
});
