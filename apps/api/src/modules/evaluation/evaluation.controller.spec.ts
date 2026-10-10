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

  // RFC 9110 §8.8.3: an entity-tag is a quoted string, so a comma INSIDE the quotes is part of the tag.
  it('does not split a validator at a comma inside its quotes', () => {
    expect(matchesEtag('"a,b"', '"a,b"')).toBe(true);
    expect(matchesEtag('"a,b"', '"b"')).toBe(false);
    expect(matchesEtag('"a,b", W/"c,d"', '"c,d"')).toBe(true);
  });

  it('matches * only when it is the whole header (If-None-Match = "*" / #entity-tag)', () => {
    expect(matchesEtag(' * ', etag)).toBe(true);
    expect(matchesEtag(`*, ${etag}`, etag)).toBe(false);
    expect(matchesEtag('"x", *', etag)).toBe(false);
  });

  it.each([
    ['a lower-case weak prefix', `w/${etag}`],
    ['a missing closing quote', '"abc123'],
    ['two validators without a comma', `${etag} ${etag}`],
  ])('treats %s as a malformed header and does not match', (_label, header) => {
    expect(matchesEtag(header, etag)).toBe(false);
  });

  it('ignores empty list elements, as RFC 9110 §5.6.1.2 requires of a recipient', () => {
    expect(matchesEtag(`,${etag},`, etag)).toBe(true);
    expect(matchesEtag(`"x", , ${etag}`, etag)).toBe(true);
  });

  it('uses weak comparison: only the opaque values are compared', () => {
    expect(matchesEtag(`W/${etag}`, `W/${etag}`)).toBe(true);
    expect(matchesEtag(etag, `W/${etag}`)).toBe(true);
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
