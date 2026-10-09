import { describe, expect, it } from 'vitest';
import { FLAG_FORM_FIELD_ORDER, validateNewFlag } from '../../app/utils/flag-form';
import type { FlagFormValues } from '../../app/utils/flag-form';

const valid: FlagFormValues = {
  name: 'New checkout',
  key: 'new-checkout',
  type: 'boolean',
  onValue: '',
  offValue: '',
};

describe('validateNewFlag', () => {
  it('accepts a boolean flag without values', () => {
    expect(validateNewFlag(valid)).toEqual({});
  });

  it('accepts a string flag with two different values', () => {
    expect(validateNewFlag({ ...valid, type: 'string', onValue: 'blue', offValue: 'red' })).toEqual(
      {},
    );
  });

  it.each([
    ['an empty name', { name: '  ' }, 'name'],
    ['a name over 120 characters', { name: 'n'.repeat(121) }, 'name'],
    ['an upper-case key', { key: 'NewCheckout' }, 'key'],
    ['a key with a space', { key: 'new checkout' }, 'key'],
    ['a key over 64 characters', { key: 'a'.repeat(65) }, 'key'],
    ['an empty key', { key: '' }, 'key'],
    ['a key starting with a separator', { key: '-a' }, 'key'],
  ])('rejects %s', (_label, change, field) => {
    expect(Object.keys(validateNewFlag({ ...valid, ...change }))).toEqual([field]);
  });

  it('accepts dots and underscores in a key, like the API', () => {
    expect(validateNewFlag({ ...valid, key: 'billing.new_checkout-v2' })).toEqual({});
  });

  it('requires both values for a string flag, and not for a boolean flag', () => {
    expect(Object.keys(validateNewFlag({ ...valid, type: 'string' }))).toEqual([
      'onValue',
      'offValue',
    ]);
    expect(validateNewFlag({ ...valid, type: 'boolean', onValue: '', offValue: '' })).toEqual({});
  });

  it('rejects equal values and over-long values', () => {
    expect(
      validateNewFlag({ ...valid, type: 'string', onValue: 'a', offValue: 'a' }).offValue,
    ).toContain('different');
    expect(
      validateNewFlag({ ...valid, type: 'string', onValue: 'a'.repeat(257), offValue: 'b' })
        .onValue,
    ).toContain('256');
  });

  it('reports fields in the order they appear, so focus goes to the first', () => {
    const errors = validateNewFlag({
      name: '',
      key: 'BAD',
      type: 'string',
      onValue: '',
      offValue: '',
    });
    expect(Object.keys(errors)).toEqual([...FLAG_FORM_FIELD_ORDER]);
  });
});
