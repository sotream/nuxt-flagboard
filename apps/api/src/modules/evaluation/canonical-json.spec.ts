import { canonicalJson } from './canonical-json.js';

describe('canonicalJson', () => {
  it('gives the same string whatever order the keys were written in', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('keeps array order, because rule order is meaningful', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ rules: [{ b: 1, a: 2 }, { a: 1 }] })).toBe(
      '{"rules":[{"a":2,"b":1},{"a":1}]}',
    );
  });

  it('handles scalars, null and nested arrays of objects', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson({ a: [null, true, 1.5, 'x'] })).toBe('{"a":[null,true,1.5,"x"]}');
  });
});
