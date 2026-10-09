import { describe, expect, it } from 'vitest';
import { describeRollout, parseRollout } from '../../app/utils/rollout';

describe('parseRollout', () => {
  it.each([
    ['0', 0],
    ['25', 25],
    ['100', 100],
    ['  42 ', 42],
    ['12.4', 12],
    ['12.5', 13],
    ['+7', 7],
    ['.5', 1],
  ])('reads %j as %i', (text, expected) => {
    expect(parseRollout(text)).toBe(expected);
  });

  it.each([
    ['101', 100],
    ['1000', 100],
    ['-5', 0],
    ['-0.4', 0],
  ])('pulls %j to the nearest end (%i)', (text, expected) => {
    expect(parseRollout(text)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '12abc', '1,5', '1e2', '--3', '5%', 'Infinity', 'NaN'])(
    'rejects %j',
    (text) => {
      expect(parseRollout(text)).toBeUndefined();
    },
  );
});

describe('describeRollout', () => {
  it('says nobody at 0, everyone at 100, and warns about the user id in between', () => {
    expect(describeRollout(0)).toContain('Nobody');
    expect(describeRollout(100)).toContain('Everyone');
    expect(describeRollout(100)).toContain('with or without a user id');
    const partial = describeRollout(30);
    expect(partial).toContain('30%');
    expect(partial).toContain('needs a user id');
  });
});
