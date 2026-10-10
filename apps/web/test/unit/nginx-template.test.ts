import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const template = readFileSync(
  path.resolve(import.meta.dirname, '../../docker/default.conf.template'),
  'utf8',
);

describe('security headers in the nginx template', () => {
  it.each([
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ])('sets %s once, at server level, for every response', (name) => {
    const lines = template.split('\n').filter((line) => line.includes(`add_header ${name} `));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('always');
  });

  it('switches off the powerful browser features the admin UI never uses', () => {
    const line = template.split('\n').find((l) => l.includes('Permissions-Policy')) ?? '';
    for (const feature of [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
    ]) {
      expect(line).toContain(feature);
    }
  });

  it('has no add_header inside a location block, which would drop the server-level ones', () => {
    const inLocations = template
      .split('\n  location ')
      .slice(1)
      .filter((block) => /^\s*add_header /m.test(block));
    expect(inLocations).toEqual([]);
  });
});
