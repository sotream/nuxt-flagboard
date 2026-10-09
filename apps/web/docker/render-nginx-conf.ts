// Build step of the web image: `node render-nginx-conf.ts <public dir> <template> <output>`.
// Reads the generated site, hashes its inline scripts and writes the nginx config with the policy filled in,
// so the policy always matches the files it protects.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentSecurityPolicy, inlineScriptHashes } from './csp.ts';

const [publicDir, templateFile, outputFile] = process.argv.slice(2);
if (!publicDir || !templateFile || !outputFile) {
  console.error('usage: node render-nginx-conf.ts <public dir> <template> <output>');
  process.exit(2);
}

const htmlFiles = readdirSync(publicDir, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith('.html'));
const hashes = [
  ...new Set(
    htmlFiles.flatMap((file) =>
      inlineScriptHashes(readFileSync(path.join(publicDir, file), 'utf8')),
    ),
  ),
].sort();

// Nuxt writes an import map and the `window.__NUXT__` script. None found means the page shape changed and the
// policy would block the app, so stop the build instead of shipping a broken site.
if (hashes.length < 2) {
  console.error(`Expected at least 2 inline scripts in ${publicDir}, found ${hashes.length}.`);
  process.exit(1);
}

const template = readFileSync(templateFile, 'utf8');
writeFileSync(outputFile, template.replace('__CSP__', contentSecurityPolicy(hashes)));
console.log(`CSP: ${hashes.length} inline script hashes from ${htmlFiles.length} HTML files`);
