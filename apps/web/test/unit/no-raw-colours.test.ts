import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

function files(dir: string, extension: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full, extension);
    return extension.test(name) ? [full] : [];
  });
}

// Every Vue and TypeScript file of the app, and the brand SVGs. The CSS files (tokens.css, main.css) are where
// colours are allowed to be written down, so they are not scanned.
const sources = [
  ...files(path.join(root, 'app'), /\.(vue|ts)$/),
  ...files(path.join(root, 'public/brand'), /\.svg$/),
];

const PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|placeholder|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;
// A `dark:` variant is a class prefix (`dark:bg-ink`); the word `dark:` followed by a space is an object key.
const DARK_VARIANT = /\bdark:(?=[\w[!-])/;
const FUNCTIONAL_COLOUR = /\b(?:rgba?|hsla?|oklch|oklab)\(/;
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/;
const SHADOW_UTILITY = /(?<![\w-])shadow(?:-(?!\[)[\w-]+)?(?![\w-])/;

describe('components use the design tokens only', () => {
  it('scans a useful number of files', () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  it.each(sources.map((file) => [path.relative(root, file), file] as const))(
    '%s has no palette class, dark: variant, raw colour or shadow',
    (_name, file) => {
      const text = readFileSync(file, 'utf8');
      const isSvg = file.endsWith('.svg');
      expect(text).not.toMatch(PALETTE);
      expect(text).not.toMatch(DARK_VARIANT);
      expect(text).not.toMatch(FUNCTIONAL_COLOUR);
      // Brand SVGs are standalone files that cannot read the app's variables, so they carry their own hex values.
      if (!isSvg) {
        expect(text).not.toMatch(HEX);
        expect(text).not.toMatch(SHADOW_UTILITY);
      }
    },
  );
});
