import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// A plain Node script (it also runs in the image build, where nothing is installed), so it is a .mjs file.
import { scan } from '../../scripts/check-external-refs.mjs';

interface Fixture {
  /** Files of the built output, by path under it. */
  output?: Record<string, string>;
  /** Files of the source `public/` directory. */
  publicDir?: Record<string, string>;
}

/** Writes a fixture to two temporary directories (the built site and `public/`) and scans it. */
async function run({ output = {}, publicDir = {} }: Fixture) {
  const base = mkdtempSync(path.join(tmpdir(), 'refs-'));
  const out = path.join(base, 'out');
  const pub = path.join(base, 'public');
  for (const [dir, files] of [
    [out, output],
    [pub, publicDir],
  ] as const) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      writeFileSync(path.join(dir, name), content);
    }
  }
  return scan(out, pub);
}

const kinds = (findings: { kind: string }[]) => findings.map((f) => f.kind);

describe('check-external-refs: external hosts', () => {
  it.each([
    [
      'a Google Fonts stylesheet link',
      'index.html',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    ],
    [
      'a Google Fonts file in @font-face',
      'a.css',
      '@font-face{font-family:X;src:url(https://fonts.gstatic.com/s/x.woff2)}',
    ],
    ['an @import from a CDN', 'a.css', '@import url("https://cdn.example.com/x.css");'],
    ['a fetch to another host in the bundle', 'app.js', 'fetch("https://api.example.org/data")'],
    ['a protocol-relative script', 'index.html', '<script src="//cdn.example.net/a.js"></script>'],
    [
      'a favicon on another host',
      'index.html',
      '<link rel="icon" href="https://example.com/favicon.ico">',
    ],
    [
      'an icon in a web manifest',
      'manifest.webmanifest',
      '{"icons":[{"src":"https://example.com/icon.png"}]}',
    ],
    [
      'an SVG image on another host',
      'logo.svg',
      '<svg><image href="http://evil.test/a.png"/></svg>',
    ],
    [
      'an SVG use of another host',
      'sprite.svg',
      '<svg><use href="https://example.com/s.svg#a"/></svg>',
    ],
    [
      'a font on a host that is not Google',
      'a.css',
      '@font-face{font-family:X;src:url(https://assets.example.io/font.woff2)}',
    ],
  ])('fails on %s', async (_label, file, content) => {
    const findings = await run({ output: { [file]: content } });
    expect(kinds(findings)).toContain('external-host');
  });

  it('allows the XML namespace identifiers of SVG, which are not requests', async () => {
    const findings = await run({
      output: {
        'logo.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"/>',
      },
    });
    expect(findings).toEqual([]);
  });

  it('allows the documentation links that libraries print in error messages, only under their own paths', async () => {
    const clean = await run({
      output: {
        'app.js':
          'const a=`https://vuejs.org/error-reference/#runtime-${n}`,b="https://nuxt.com/docs/4.x/errors/x"',
      },
    });
    expect(clean).toEqual([]);
    const other = await run({
      output: { 'app.js': 'const a="https://nuxt.com.evil.io/docs/x",b="https://vuejs.org/other"' },
    });
    expect(kinds(other)).toEqual(['external-host', 'external-host']);
  });

  it('does not read plain text files such as the font licences', async () => {
    const findings = await run({
      output: { 'fonts/OFL.txt': 'See https://openfontlicense.org for the FAQ.' },
    });
    expect(findings).toEqual([]);
  });

  it('names the file and the value it found', async () => {
    const [finding] = await run({
      output: { 'index.html': '<link rel="icon" href="https://example.com/favicon.ico">' },
    });
    expect(finding).toMatchObject({
      file: 'index.html',
      kind: 'external-host',
      value: expect.stringContaining('https://example.com/favicon.ico'),
    });
  });
});

describe('check-external-refs: local files', () => {
  const page = (...tags: string[]) => `<!doctype html><head>${tags.join('')}</head>`;

  it('passes a clean site where every referenced file exists in the output and in public/', async () => {
    const findings = await run({
      output: {
        'index.html': page(
          '<link rel="icon" href="/favicon.svg">',
          '<link rel="preload" as="font" href="/fonts/a.woff2">',
          '<link rel="stylesheet" href="/_nuxt/entry.css">',
          '<script src="/_nuxt/entry.js"></script>',
        ),
        'favicon.svg': '<svg viewBox="0 0 1 1"/>',
        'fonts/a.woff2': 'x',
        '_nuxt/entry.css': 'body{color:red}',
        '_nuxt/entry.js': 'console.log(1)',
      },
      publicDir: { 'favicon.svg': '<svg/>', 'fonts/a.woff2': 'x' },
    });
    expect(findings).toEqual([]);
  });

  it('fails when index.html references a file that is not in the output', async () => {
    const findings = await run({
      output: { 'index.html': page('<link rel="icon" href="/favicon.svg">') },
      publicDir: { 'favicon.svg': '<svg/>' },
    });
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'missing-file', value: '/favicon.svg' }),
    ]);
  });

  it('fails when the output has the file but public/ does not (it came from somewhere else)', async () => {
    const findings = await run({
      output: {
        'index.html': page('<link rel="preload" as="font" href="/fonts/a.woff2">'),
        'fonts/a.woff2': 'x',
      },
    });
    expect(findings).toEqual([
      expect.objectContaining({ kind: 'missing-file', value: '/fonts/a.woff2' }),
    ]);
  });

  it('checks the files named by @font-face: they must be same-origin paths that exist', async () => {
    const missing = await run({
      output: { 'a.css': '@font-face{font-family:X;src:url(/fonts/gone.woff2)}' },
    });
    expect(kinds(missing)).toContain('missing-file');

    const relativeOk = await run({
      output: {
        'css/a.css': '@font-face{font-family:X;src:url(../fonts/a.woff2)}',
        'fonts/a.woff2': 'x',
      },
    });
    expect(relativeOk).toEqual([]);
  });
});
