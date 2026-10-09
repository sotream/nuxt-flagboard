import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const publicDir = path.join(root, 'public');
const config = readFileSync(path.join(root, 'nuxt.config.ts'), 'utf8');

const SVGS = ['favicon.svg', 'brand/flagboard-mark.svg', 'brand/flagboard-wordmark.svg'];
const PNG_SIZES: Record<string, number> = {
  'favicon-16.png': 16,
  'favicon-32.png': 32,
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
};

describe('head links in nuxt.config.ts', () => {
  it.each([
    ["rel: 'icon'", "href: '/favicon.svg'", "type: 'image/svg+xml'"],
    ["rel: 'icon'", "href: '/favicon-32.png'", "sizes: '32x32'"],
    ["rel: 'icon'", "href: '/favicon-16.png'", "sizes: '16x16'"],
    ["rel: 'apple-touch-icon'", "href: '/apple-touch-icon.png'", "sizes: '180x180'"],
  ])('declares %s %s %s', (...parts) => {
    for (const part of parts) expect(config).toContain(part);
  });

  it('sets a theme colour for each system theme', () => {
    expect(config).toContain("content: '#F7F7F5'");
    expect(config).toContain("media: '(prefers-color-scheme: light)'");
    expect(config).toContain("content: '#0D0D0E'");
    expect(config).toContain("media: '(prefers-color-scheme: dark)'");
  });

  it('only names files that exist under public/', () => {
    const hrefs = [...config.matchAll(/href: '(\/[^']+)'/g)].map((m) => m[1] ?? '');
    expect(hrefs.length).toBeGreaterThanOrEqual(5);
    for (const href of hrefs) expect(existsSync(path.join(publicDir, href)), href).toBe(true);
  });
});

describe('brand SVG files', () => {
  it.each(SVGS)('%s is self-contained', (file) => {
    const svg = readFileSync(path.join(publicDir, file), 'utf8');
    expect(svg).toContain('viewBox=');
    expect(svg).not.toMatch(/<script|<image|<foreignObject|@import|url\(/i);
    // Only the XML namespace is a URL; nothing is requested.
    const urls = [...svg.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
    expect(urls.every((u) => u === 'http://www.w3.org/2000/svg')).toBe(true);
  });

  it('draws the wordmark as outlines, not as text that needs a font', () => {
    const svg = readFileSync(path.join(publicDir, 'brand/flagboard-wordmark.svg'), 'utf8');
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('font-family');
    expect(svg.length).toBeGreaterThan(3000);
  });
});

describe('PNG icons', () => {
  it.each(Object.entries(PNG_SIZES))('%s is a %i px square PNG', (file, size) => {
    const bytes = readFileSync(path.join(publicDir, file));
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    // The IHDR chunk follows the 8 byte signature: length, "IHDR", width, height.
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  });
});
