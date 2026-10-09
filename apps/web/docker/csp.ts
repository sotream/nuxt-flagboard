import { createHash } from 'node:crypto';

// Matches `<script ...>body</script>` without a `src`. Nuxt writes these tags itself, in a fixed shape, so a
// regular expression is enough; the build fails when it finds none (see render-nginx-conf.mjs).
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;
// Script types the browser executes. Other types (such as application/json) are data and need no hash.
const EXECUTABLE_TYPES = new Set(['', 'module', 'importmap', 'text/javascript']);

/** The CSP source expression (`'sha256-...'`) of every executable inline script in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const [, attributes, body] of html.matchAll(INLINE_SCRIPT)) {
    const type = /\stype=["']([^"']*)["']/.exec(attributes)?.[1] ?? '';
    if (!EXECUTABLE_TYPES.has(type)) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  }
  return [...hashes].sort();
}

/**
 * The Content-Security-Policy for the built site. Scripts: own files and the hashed inline ones, never
 * `'unsafe-inline'`. Styles allow `'unsafe-inline'` because Tailwind and Vue set inline styles.
 */
export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
