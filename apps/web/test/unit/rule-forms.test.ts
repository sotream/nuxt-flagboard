import { describe, expect, it } from 'vitest';
import type { Rule } from '../../app/utils/api-types';
import {
  emptyCondition,
  emptyRule,
  LIMITS,
  toRuleForms,
  toRules,
} from '../../app/utils/rule-forms';
import type { ConditionForm, RuleForm } from '../../app/utils/rule-forms';

const rule = (condition: Partial<ConditionForm> = {}, serve: 'on' | 'off' = 'on'): RuleForm => ({
  serve,
  conditions: [{ ...emptyCondition(), attribute: 'country', value: 'UA', ...condition }],
});

describe('toRules: valid forms become API rules', () => {
  it('reads an equals condition on text', () => {
    const { rules, valid } = toRules([rule()]);
    expect(valid).toBe(true);
    expect(rules).toEqual([
      { conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }], serve: 'on' },
    ]);
  });

  it('keeps types strict: the same text is a string, a number or a boolean depending on the chosen type', () => {
    const value = (valueType: ConditionForm['valueType'], text: string) =>
      toRules([rule({ valueType, value: text })]).rules[0]!.conditions[0];

    expect(value('text', '1')).toMatchObject({ value: '1' });
    expect(value('number', '1')).toMatchObject({ value: 1 });
    expect(value('boolean', 'true')).toMatchObject({ value: true });
    expect(value('boolean', 'false')).toMatchObject({ value: false });
    expect(value('number', ' 2.5 ')).toMatchObject({ value: 2.5 });
    expect(value('number', '-3')).toMatchObject({ value: -3 });
  });

  it('reads an in condition as a list, ignoring spaces and empty entries', () => {
    const { rules, valid } = toRules([rule({ operator: 'in', value: ' pro, team ,, ' })]);
    expect(valid).toBe(true);
    expect(rules[0]!.conditions[0]).toEqual({
      attribute: 'country',
      operator: 'in',
      values: ['pro', 'team'],
    });
  });

  it('reads typed lists', () => {
    expect(
      toRules([rule({ operator: 'in', valueType: 'number', value: '1, 2, 3.5' })]).rules[0]!
        .conditions[0],
    ).toMatchObject({
      values: [1, 2, 3.5],
    });
    expect(
      toRules([rule({ operator: 'in', valueType: 'boolean', value: 'true, false' })]).rules[0]!
        .conditions[0],
    ).toMatchObject({
      values: [true, false],
    });
  });

  it('keeps the order of rules and conditions, and what each serves', () => {
    const first = rule({ attribute: 'a', value: '1' }, 'off');
    const second: RuleForm = {
      serve: 'on',
      conditions: [
        { ...emptyCondition(), attribute: 'b', value: 'x' },
        { ...emptyCondition(), attribute: 'c', value: 'y' },
      ],
    };
    const { rules } = toRules([first, second]);
    expect(rules.map((r) => r.serve)).toEqual(['off', 'on']);
    expect(rules[1]!.conditions.map((c) => c.attribute)).toEqual(['b', 'c']);
  });

  it('trims the attribute name', () => {
    expect(toRules([rule({ attribute: '  plan ' })]).rules[0]!.conditions[0]).toMatchObject({
      attribute: 'plan',
    });
  });

  it('accepts no rules at all', () => {
    expect(toRules([])).toEqual({ rules: [], errors: [], valid: true });
  });
});

describe('toRules: problems', () => {
  const problem = (condition: Partial<ConditionForm>) => {
    const result = toRules([rule(condition)]);
    expect(result.valid).toBe(false);
    return result.errors[0]!.conditions[0]!;
  };

  it.each([
    ['an empty attribute', { attribute: '' }, 'attribute', 'Enter an attribute name.'],
    ['an attribute with a space', { attribute: 'my attr' }, 'attribute', 'letters, digits'],
    ['an attribute over 64 characters', { attribute: 'a'.repeat(65) }, 'attribute', '64'],
    ['an empty text value', { value: '' }, 'value', 'Enter a value.'],
    ['a text value over 256 characters', { value: 'v'.repeat(257) }, 'value', '256'],
    [
      'text that is not a number',
      { valueType: 'number' as const, value: 'abc' },
      'value',
      'not a number',
    ],
    ['an empty number', { valueType: 'number' as const, value: '' }, 'value', 'not a number'],
    [
      'an infinite number',
      { valueType: 'number' as const, value: 'Infinity' },
      'value',
      'not a number',
    ],
    [
      'a boolean that is neither',
      { valueType: 'boolean' as const, value: 'yes' },
      'value',
      'true or false',
    ],
    ['an empty list', { operator: 'in' as const, value: ' , ' }, 'value', 'at least one value'],
    [
      'a list with a bad number',
      { operator: 'in' as const, valueType: 'number' as const, value: '1, x' },
      'value',
      '"x" is not a number',
    ],
    [
      'more than 50 values',
      { operator: 'in' as const, value: Array.from({ length: 51 }, (_, i) => `v${i}`).join(',') },
      'value',
      '50',
    ],
  ])('rejects %s', (_label, condition, field, text) => {
    expect(problem(condition)[field as 'attribute' | 'value']).toContain(text);
  });

  it('reports a rule without conditions and one with too many', () => {
    const none = toRules([{ serve: 'on', conditions: [] }]);
    expect(none.valid).toBe(false);
    expect(none.errors[0]!.rule).toBe('Add at least one condition.');

    const many = toRules([
      {
        serve: 'on',
        conditions: Array.from({ length: LIMITS.conditionsPerRule + 1 }, () => ({
          ...emptyCondition(),
          attribute: 'a',
          value: 'x',
        })),
      },
    ]);
    expect(many.errors[0]!.rule).toContain('10 conditions');
  });

  it('refuses more than 20 rules', () => {
    expect(toRules(Array.from({ length: LIMITS.rules + 1 }, () => rule())).valid).toBe(false);
    expect(toRules(Array.from({ length: LIMITS.rules }, () => rule())).valid).toBe(true);
  });

  it('reports every problem, per rule and per condition, so each field can show its own', () => {
    const { errors } = toRules([
      rule({ attribute: '' }),
      rule(),
      {
        serve: 'on',
        conditions: [
          { ...emptyCondition(), attribute: 'ok', value: 'x' },
          { ...emptyCondition(), attribute: 'bad name', value: '' },
        ],
      },
    ]);
    expect(errors[0]!.conditions[0]!.attribute).toBeDefined();
    expect(errors[1]!.conditions[0]).toEqual({});
    expect(errors[2]!.conditions[0]).toEqual({});
    expect(errors[2]!.conditions[1]).toEqual({
      attribute: expect.any(String),
      value: expect.any(String),
    });
  });
});

describe('toRuleForms', () => {
  it('reads saved rules back into forms, remembering each value type', () => {
    const rules: Rule[] = [
      {
        serve: 'off',
        conditions: [
          { attribute: 'tier', operator: 'equals', value: 3 },
          { attribute: 'beta', operator: 'equals', value: true },
          { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
          { attribute: 'age', operator: 'in', values: [18, 21] },
        ],
      },
    ];
    expect(toRuleForms(rules)).toEqual([
      {
        serve: 'off',
        conditions: [
          { attribute: 'tier', operator: 'equals', valueType: 'number', value: '3' },
          { attribute: 'beta', operator: 'equals', valueType: 'boolean', value: 'true' },
          { attribute: 'plan', operator: 'in', valueType: 'text', value: 'pro, team' },
          { attribute: 'age', operator: 'in', valueType: 'number', value: '18, 21' },
        ],
      },
    ]);
  });

  it('round-trips: forms made from rules produce the same rules', () => {
    const rules: Rule[] = [
      {
        serve: 'on',
        conditions: [
          { attribute: 'country', operator: 'in', values: ['UA', 'PL'] },
          { attribute: 'tier', operator: 'equals', value: 2 },
        ],
      },
      { serve: 'off', conditions: [{ attribute: 'beta', operator: 'equals', value: false }] },
    ];
    expect(toRules(toRuleForms(rules)).rules).toEqual(rules);
  });

  it('starts a new rule with one empty condition', () => {
    expect(emptyRule()).toEqual({
      serve: 'on',
      conditions: [{ attribute: '', operator: 'equals', valueType: 'text', value: '' }],
    });
  });
});
