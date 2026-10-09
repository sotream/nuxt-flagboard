import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey, isWellFormedApiKey } from './api-key.js';

describe('generateApiKey', () => {
  it('prefixes the key by kind and carries 256 random bits', () => {
    const server = generateApiKey('server');
    const client = generateApiKey('client');

    expect(server.plaintext).toMatch(/^fb_srv_[A-Za-z0-9_-]{43}$/);
    expect(client.plaintext).toMatch(/^fb_cli_[A-Za-z0-9_-]{43}$/);
  });

  it('returns the SHA-256 of the key as its hash and a short prefix for display', () => {
    const { plaintext, prefix, hash } = generateApiKey('server');

    expect(hash).toBe(createHash('sha256').update(plaintext).digest('hex'));
    expect(prefix).toBe(plaintext.slice(0, 11));
    expect(prefix).toMatch(/^fb_srv_/);
    expect(plaintext).not.toBe(prefix);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateApiKey('client').plaintext));
    expect(keys.size).toBe(1000);
  });
});

describe('hashApiKey', () => {
  it('is deterministic, so a key can be looked up by its hash', () => {
    const { plaintext, hash } = generateApiKey('server');
    expect(hashApiKey(plaintext)).toBe(hash);
  });
});

describe('isWellFormedApiKey', () => {
  const valid = generateApiKey('server').plaintext;

  it('accepts generated keys of both kinds', () => {
    expect(isWellFormedApiKey(valid)).toBe(true);
    expect(isWellFormedApiKey(generateApiKey('client').plaintext)).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['a JWT-like token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'],
    ['an unknown prefix', valid.replace('fb_srv_', 'fb_adm_')],
    ['a short key', valid.slice(0, 20)],
    ['a long key', `${valid}x`],
    ['a key with a forbidden character', `${valid.slice(0, -1)}!`],
    ['a key with whitespace', ` ${valid}`],
  ])('rejects %s', (_label, value) => {
    expect(isWellFormedApiKey(value)).toBe(false);
  });
});
