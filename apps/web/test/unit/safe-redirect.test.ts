import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../../app/utils/safe-redirect';

describe('safeRedirect', () => {
  it.each([
    '/',
    '/projects/demo',
    '/projects/demo/flags/new-checkout?env=prod',
    '/projects/demo#audit',
  ])('keeps the local path %s', (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    ['another site', 'https://evil.example.com'],
    ['a protocol-relative URL', '//evil.example.com'],
    ['a backslash trick', '/\\evil.example.com'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a relative path', 'projects'],
    ['a newline inside the path', '/projects\n//evil.example.com'],
    ['nothing', undefined],
    ['an array', ['/projects']],
    ['an empty string', ''],
  ])('falls back to the home page for %s', (_label, value) => {
    expect(safeRedirect(value)).toBe('/');
  });
});
