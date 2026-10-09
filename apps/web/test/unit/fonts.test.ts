import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const fontsDir = path.join(root, 'public/fonts');
const css = readFileSync(path.join(root, 'app/assets/css/fonts.css'), 'utf8');
const provenance = readFileSync(path.join(fontsDir, 'PROVENANCE.md'), 'utf8');

const FILES = [
  'geologica-latin.woff2',
  'geologica-cyrillic.woff2',
  'geist-mono-latin.woff2',
] as const;
/** The characters a German or Ukrainian reader needs, including typographic quotes and dashes. */
const GERMAN = [...'äöüÄÖÜß„“”‚‘’–—…€•'];
const UKRAINIAN = [...'їєґЇЄҐі'];

/** `U+0020-007E,U+00A0-00FF,U+2018` into numeric ranges. */
function parseRanges(list: string): [number, number][] {
  return list.split(',').map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
    const start = Number.parseInt(from ?? '', 16);
    return [start, to ? Number.parseInt(to, 16) : start];
  });
}
const covers = (ranges: [number, number][], char: string): boolean => {
  const code = char.codePointAt(0) ?? -1;
  return ranges.some(([a, b]) => code >= a && code <= b);
};

function faceRanges(file: string): [number, number][] {
  const block = css.split('@font-face').find((b) => b.includes(file));
  const range = /unicode-range:\s*([^;]+);/.exec(block ?? '')?.[1];
  if (!range) throw new Error(`no unicode-range for ${file}`);
  return parseRanges(range);
}

describe('font files', () => {
  it.each(FILES)('%s is a woff2 file', (file) => {
    const head = readFileSync(path.join(fontsDir, file)).subarray(0, 4).toString('latin1');
    expect(head).toBe('wOF2');
  });

  it('keeps the Latin payload under 56,000 bytes and the Cyrillic file under 20,000', () => {
    const size = (f: string) => statSync(path.join(fontsDir, f)).size;
    expect(size('geologica-latin.woff2') + size('geist-mono-latin.woff2')).toBeLessThan(56_000);
    expect(size('geologica-cyrillic.woff2')).toBeLessThan(20_000);
  });

  it.each(FILES)('%s matches the SHA-256 recorded in PROVENANCE.md', (file) => {
    const sha = createHash('sha256')
      .update(readFileSync(path.join(fontsDir, file)))
      .digest('hex');
    expect(provenance).toContain(`${sha}  ${file}`);
  });

  it('ships the licence texts next to the fonts', () => {
    for (const file of ['OFL-Geologica.txt', 'OFL-GeistMono.txt']) {
      expect(readFileSync(path.join(fontsDir, file), 'utf8')).toContain(
        'SIL OPEN FONT LICENSE Version 1.1',
      );
    }
  });
});

describe('@font-face rules', () => {
  it('only name files that exist under public/fonts and use same-origin paths', () => {
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => (m[1] ?? '').replace(/['"]/g, ''));
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const url of urls) {
      expect(url).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(path.join(root, 'public', url))).toBe(true);
    }
  });

  it('use font-display: swap on every face that loads a file', () => {
    const faces = css
      .split('@font-face')
      .slice(1)
      .filter((b) => b.includes('url('));
    for (const face of faces) expect(face).toContain('font-display: swap');
  });

  it('send the German characters to the Latin files and never to the Cyrillic file', () => {
    for (const file of ['geologica-latin.woff2', 'geist-mono-latin.woff2'] as const) {
      const ranges = faceRanges(file);
      for (const char of GERMAN) {
        expect(covers(ranges, char), `${file} should cover ${char}`).toBe(true);
      }
    }
    const cyrillic = faceRanges('geologica-cyrillic.woff2');
    for (const char of UKRAINIAN) expect(covers(cyrillic, char), char).toBe(true);
    for (const char of GERMAN) expect(covers(cyrillic, char), char).toBe(false);
  });

  it('define fallback faces with measured metrics', () => {
    expect(css).toContain("font-family: 'Geologica Fallback'");
    expect(css).toMatch(/size-adjust:\s*108\.05%/);
    expect(css).toContain("font-family: 'Geist Mono Fallback'");
  });
});
