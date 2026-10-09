import { describe, expect, it } from 'vitest';
import { PROJECT_KEY_PATTERN, slugify } from '../../app/utils/slugify';

describe('slugify', () => {
  it.each([
    ['Checkout', 'checkout'],
    ['New Checkout Flow', 'new-checkout-flow'],
    ['  spaces   and   gaps  ', 'spaces-and-gaps'],
    ['Café Ürban', 'cafe-urban'],
    ['v2.0 (beta)!', 'v2-0-beta'],
    ['--already--dashed--', 'already-dashed'],
    ['ALL CAPS 42', 'all-caps-42'],
  ])('turns %j into %j', (name, key) => {
    expect(slugify(name)).toBe(key);
  });

  it('gives an empty key when nothing usable is left', () => {
    expect(slugify('')).toBe('');
    expect(slugify('!!! ???')).toBe('');
    expect(slugify('Привіт')).toBe('');
  });

  it('cuts at 64 characters without leaving a trailing dash', () => {
    const key = slugify(`${'a'.repeat(63)} b`);
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key.endsWith('-')).toBe(false);
  });

  it('only produces keys the API accepts', () => {
    for (const name of ['Checkout v2', 'a  b', 'x'.repeat(100), 'Ünï-cödé 7']) {
      const key = slugify(name);
      expect(key === '' || PROJECT_KEY_PATTERN.test(key)).toBe(true);
    }
  });
});

describe('PROJECT_KEY_PATTERN', () => {
  it.each(['a', 'checkout', 'new-checkout', 'v2', '2fa'])('accepts %s', (key) => {
    expect(PROJECT_KEY_PATTERN.test(key)).toBe(true);
  });

  it.each(['', 'Checkout', '-a', 'a-', 'a--b', 'a b', 'a_b'])('rejects %j', (key) => {
    expect(PROJECT_KEY_PATTERN.test(key)).toBe(false);
  });
});
