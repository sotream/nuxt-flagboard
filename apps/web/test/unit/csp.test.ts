import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes } from '../../docker/csp.ts';

const sha = (body: string) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes the import map and the plain inline script, exactly as written', () => {
    const importMap = '{"imports":{"#entry":"/_nuxt/a.js"}}';
    const config = 'window.__NUXT__={};';
    const html = `<script type="importmap">${importMap}</script><body><script>${config}</script>`;

    expect(inlineScriptHashes(html)).toEqual([sha(importMap), sha(config)].sort());
  });

  it('skips scripts with a src and data blocks the browser does not execute', () => {
    const html =
      '<script src="/theme-init.js"></script>' +
      '<script type="module" src="/_nuxt/a.js" crossorigin></script>' +
      '<script type="application/json" id="__NUXT_DATA__">[1,2]</script>';

    expect(inlineScriptHashes(html)).toEqual([]);
  });

  it('hashes a script once even when many pages repeat it', () => {
    const html = '<script>same()</script><script>same()</script>';
    expect(inlineScriptHashes(html)).toHaveLength(1);
  });
});

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy([sha('a'), sha('b')]);
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('allows own scripts and the listed hashes, never unsafe-inline', () => {
    expect(directive('script-src')).toBe(`script-src 'self' ${sha('a')} ${sha('b')}`);
  });

  it('closes plugins, base tags, framing and foreign form targets', () => {
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
  });

  it('serves fonts and images from the own origin only', () => {
    expect(directive('font-src')).toBe("font-src 'self'");
    expect(directive('img-src')).toBe("img-src 'self' data:");
  });

  it('names no host and no wildcard in any directive', () => {
    expect(policy).not.toMatch(/https?:|\*|\/\//);
  });

  it('allows inline styles only (Tailwind and Vue set them)', () => {
    expect(directive('style-src')).toBe("style-src 'self' 'unsafe-inline'");
  });
});
