import { matchesEtag } from './evaluation.controller.js';

const etag = '"abc123"';

describe('matchesEtag', () => {
  it('matches the same validator', () => {
    expect(matchesEtag(etag, etag)).toBe(true);
  });

  it('matches a weak validator with the same value', () => {
    expect(matchesEtag(`W/${etag}`, etag)).toBe(true);
  });

  it('matches when the validator is one of several', () => {
    expect(matchesEtag(`"other", ${etag} , "third"`, etag)).toBe(true);
  });

  it('matches *', () => {
    expect(matchesEtag('*', etag)).toBe(true);
  });

  it.each([
    ['a different validator', '"zzz"'],
    ['an unquoted value', 'abc123'],
    ['an empty header', ''],
    [undefined, undefined],
  ])('does not match %s', (_label, header) => {
    expect(matchesEtag(header as string | undefined, etag)).toBe(false);
  });
});
