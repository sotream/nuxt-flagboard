import { BadRequestException } from '@nestjs/common';
import { parseFlagValue, resolveFlagValues } from './flag-values.js';

describe('resolveFlagValues', () => {
  it('defaults a boolean flag to true and false', () => {
    expect(resolveFlagValues('boolean', undefined, undefined)).toEqual({
      onValue: 'true',
      offValue: 'false',
    });
  });

  it('allows a boolean flag with inverted values', () => {
    expect(resolveFlagValues('boolean', false, true)).toEqual({
      onValue: 'false',
      offValue: 'true',
    });
  });

  it.each([
    ['strings for a boolean flag', 'boolean', 'true', 'false'],
    ['equal boolean values', 'boolean', true, true],
    ['a missing string value', 'string', 'blue', undefined],
    ['booleans for a string flag', 'string', true, false],
    ['equal string values', 'string', 'blue', 'blue'],
    ['an empty string value', 'string', '', 'red'],
    ['a value over 256 characters', 'string', 'x'.repeat(257), 'red'],
  ] as const)('rejects %s', (_label, type, on, off) => {
    expect(() => resolveFlagValues(type, on, off)).toThrow(BadRequestException);
  });

  it('accepts two different strings', () => {
    expect(resolveFlagValues('string', 'blue', 'red')).toEqual({
      onValue: 'blue',
      offValue: 'red',
    });
  });
});

describe('parseFlagValue', () => {
  it('reads boolean flags back as booleans', () => {
    expect(parseFlagValue('boolean', 'true')).toBe(true);
    expect(parseFlagValue('boolean', 'false')).toBe(false);
  });

  it('keeps string values as they are, including the text "true"', () => {
    expect(parseFlagValue('string', 'true')).toBe('true');
    expect(parseFlagValue('string', 'blue')).toBe('blue');
  });
});
