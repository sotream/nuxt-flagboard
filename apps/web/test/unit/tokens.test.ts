import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  path.resolve(import.meta.dirname, '../../app/assets/css/tokens.css'),
  'utf8',
);

/** The `--name: #hex;` pairs of one block (`:root { ... }` or `:root.dark { ... }`). */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]),
  );
}
const light = block(':root');
const dark = block(':root.dark');

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** [foreground, background, minimum ratio]: 4.5 for text, 3 for control edges and focus. */
const PAIRS: [string, string, number][] = [
  ['ink', 'page', 4.5],
  ['ink', 'surface', 4.5],
  ['muted', 'page', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'subtle', 4.5],
  ['faint', 'subtle', 4.5], // faint text sits on subtle when a row is hovered
  ['faint', 'page', 4.5],
  ['faint', 'surface', 4.5],
  ['accent', 'page', 4.5],
  ['accent', 'surface', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent-ink', 'accent-subtle', 4.5],
  ['on', 'surface', 4.5],
  ['on', 'on-subtle', 4.5],
  ['kill', 'surface', 4.5],
  ['kill', 'kill-subtle', 4.5],
  ['kill-fg', 'kill', 4.5],
  ['warn', 'surface', 4.5],
  ['warn', 'warn-subtle', 4.5],
  ['edge', 'surface', 3],
  ['edge', 'page', 3],
  ['accent', 'page', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme tokens', (_name, tokens) => {
  it.each(PAIRS)('%s on %s reaches %s:1', (fg, bg, min) => {
    const a = tokens[fg];
    const b = tokens[bg];
    expect(a, `--${fg} is defined`).toBeDefined();
    expect(b, `--${bg} is defined`).toBeDefined();
    expect(ratio(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
  });
});

describe('token sets', () => {
  it('define the same names in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
  it('use the approved accent', () => {
    expect(light.accent?.toLowerCase()).toBe('#0a6aa6');
    expect(dark.accent?.toLowerCase()).toBe('#5fb4e8');
  });
});
