// Renders public/favicon.svg to the PNG sizes browsers and phones ask for. Run once, by hand, when the mark changes:
//   node apps/web/scripts/render-favicons.mjs
// It borrows the Playwright of the e2e workspace, so the web app needs no extra dependency. The PNGs are committed.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const { chromium } = createRequire(path.resolve(import.meta.dirname, '../../e2e/package.json'))(
  '@playwright/test',
);

const publicDir = path.resolve(import.meta.dirname, '../public');
const svg = readFileSync(path.join(publicDir, 'favicon.svg'), 'utf8');
// `flat` is the apple-touch icon: a square with a solid background (iOS rounds the corners itself and dislikes
// transparency), so the tile's own rounded corners are removed.
const TARGETS = [
  { file: 'favicon-16.png', size: 16 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180, flat: true },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, flat } of TARGETS) {
  await page.setViewportSize({ width: size, height: size });
  const markup = flat ? svg.replace('rx="6"', 'rx="0"') : svg;
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  await page.screenshot({
    path: path.join(publicDir, file),
    omitBackground: !flat,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}
await browser.close();
