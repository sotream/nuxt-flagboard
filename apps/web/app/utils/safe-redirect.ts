/**
 * Where to go after signing in. Only a path on this site is accepted: anything that could leave it (another host,
 * a protocol-relative `//host`, a backslash trick, a `javascript:` URL) falls back to the home page.
 */
export function safeRedirect(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return '/';
  }
  if ([...value].some((character) => character.charCodeAt(0) < 32)) {
    return '/'; // control characters (newlines, tabs) have no place in a path
  }
  return value;
}
