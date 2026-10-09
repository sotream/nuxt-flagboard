// Fails the build when the built site points outside its own origin, or at a file that is not there.
//
//   node scripts/check-external-refs.mjs <built output dir> <source public dir>
//
// It checks, in every text file of the output (HTML, CSS, JS, SVG, JSON, web manifests):
//   - any URL with a host (`https://...`, `http://...`, `//host/...`), whichever host it is: fonts, styles, scripts,
//     images, favicons and manifest icons all end up here. A visitor's browser must never contact another host.
//   - every local file that an HTML page links to (`link`, `script`, `img`, `source`, `use`, `image`) exists in the
//     output and, outside `/_nuxt/` (the hashed build files), also in the source `public/` directory;
//   - every file named by an `@font-face` rule exists.
// Plain Node with no dependencies, so it also runs inside the image build.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Plain `.txt` files (the font licences, with their upstream links) are not scanned: a browser never reads a
// resource out of them.
const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.svg',
  '.json',
  '.webmanifest',
  '.xml',
]);

/**
 * URLs that may appear because they are identifiers, comments or text printed in a message, never requests. Each entry
 * was checked in the built bundle (a string constant, never passed to fetch, src or href) and has a reason. `exact`
 * must equal the whole match; `prefix` allows anything under a documentation path. A new URL fails the check on
 * purpose, so someone looks at it.
 */
const ALLOWED = [
  { exact: 'http://www.w3.org/2000/svg', reason: 'the SVG XML namespace' },
  { exact: 'http://www.w3.org/1999/xlink', reason: 'the XLink XML namespace' },
  { exact: 'http://www.w3.org/1998/Math/MathML', reason: 'the MathML XML namespace (Vue runtime)' },
  {
    exact: 'https://a.invalid/probe/',
    reason: 'base for new URL() in the router; .invalid is reserved, never requested',
  },
  {
    exact: 'https://b.invalid/probe/',
    reason: 'base for new URL() in the router; .invalid is reserved, never requested',
  },
  { exact: 'https://tailwindcss.com', reason: 'the licence banner comment of the generated CSS' },
  { prefix: 'https://nuxt.com/docs/', reason: 'a documentation link printed in an error message' },
  {
    prefix: 'https://vuejs.org/error-reference/',
    reason: 'a documentation link printed in an error message',
  },
];
const isAllowed = (value) =>
  ALLOWED.some((entry) => (entry.exact ? value === entry.exact : value.startsWith(entry.prefix)));

const URL_PATTERN = /(?:https?:)?\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?::\d+)?[^\s"'`)<>\\]*/g;
const TAG_PATTERN = /<(?:link|script|img|source|use|image)\b[^>]*>/gi;
const ATTRIBUTE_PATTERN = /\b(?:href|src|srcset|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const FONT_FACE_PATTERN = /@font-face\s*\{([^}]*)\}/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat();
}

const isLocal = (value) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);

/** The file a root-relative or relative reference names, inside `baseDir`. Routes (no extension) are not files. */
function fileOf(reference, fromFile, baseDir) {
  const clean = reference.split(/[?#]/)[0];
  if (!clean || !path.extname(clean)) return undefined;
  return clean.startsWith('/')
    ? path.join(baseDir, clean)
    : path.resolve(path.dirname(fromFile), clean);
}

function externalHosts(text, file, rel) {
  return [...text.matchAll(URL_PATTERN)]
    .map((match) => match[0])
    .filter((value) => !isAllowed(value))
    .map((value) => ({ file: rel(file), kind: 'external-host', value }));
}

/** Is the file a page refers to missing from the output, or (for files that come from public/) from public/? */
function missingReference(value, file, outputDir, publicDir) {
  const inOutput = fileOf(value, file, outputDir);
  if (!inOutput) return false;
  if (!existsSync(inOutput)) return true;
  const hashedBuildFile = value.split(/[?#]/)[0].startsWith('/_nuxt/');
  if (!value.startsWith('/') || hashedBuildFile) return false;
  const inPublic = fileOf(value, file, publicDir);
  return inPublic !== undefined && !existsSync(inPublic);
}

function htmlReferences(text, file, outputDir, publicDir, rel) {
  const values = [...text.matchAll(TAG_PATTERN)].flatMap((tag) =>
    [...tag[0].matchAll(ATTRIBUTE_PATTERN)].map((attribute) => attribute[1] ?? attribute[2] ?? ''),
  );
  return values
    .filter((value) => isLocal(value) && missingReference(value, file, outputDir, publicDir))
    .map((value) => ({ file: rel(file), kind: 'missing-file', value }));
}

function fontFaceFiles(text, file, outputDir, rel) {
  const findings = [];
  for (const rule of text.matchAll(FONT_FACE_PATTERN)) {
    for (const url of rule[1].matchAll(CSS_URL_PATTERN)) {
      const value = url[2].trim();
      if (!isLocal(value) || value.startsWith('data:')) continue;
      const target = fileOf(value, file, outputDir);
      if (target && !existsSync(target))
        findings.push({ file: rel(file), kind: 'missing-file', value });
    }
  }
  return findings;
}

/** All problems found in the built site. `outputDir` is the generated site, `publicDir` the source `public/`. */
export async function scan(outputDir, publicDir) {
  const rel = (file) => path.relative(outputDir, file);
  const findings = [];
  for (const file of await listFiles(outputDir)) {
    const extension = path.extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const text = await readFile(file, 'utf8');
    findings.push(...externalHosts(text, file, rel));
    if (extension === '.html')
      findings.push(...htmlReferences(text, file, outputDir, publicDir, rel));
    if (extension === '.html' || extension === '.css')
      findings.push(...fontFaceFiles(text, file, outputDir, rel));
  }
  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [outputDir, publicDir] = process.argv.slice(2);
  if (!outputDir || !publicDir) {
    console.error('usage: check-external-refs.mjs <built output dir> <source public dir>');
    process.exit(2);
  }
  const findings = await scan(path.resolve(outputDir), path.resolve(publicDir));
  for (const { file, kind, value } of findings) console.error(`${file}: ${kind}: ${value}`);
  console.log(
    findings.length === 0
      ? 'No external references and no missing files.'
      : `${findings.length} problem(s) found.`,
  );
  process.exit(findings.length === 0 ? 0 : 1);
}
