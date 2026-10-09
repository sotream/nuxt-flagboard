/** True for the sign-in page however it is written: with or without a trailing slash, a query or a hash. */
export function isLoginPath(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] ?? '';
  return pathname.replace(/\/+$/, '') === '/login';
}

/**
 * Where to go after signing in. Only a path on this site is accepted: anything that could leave it (another host,
 * a protocol-relative `//host`, a backslash trick, a `javascript:` URL) falls back to the home page, and so does the sign-in page itself.
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
  // Signing in and landing on the sign-in page again would look like the sign-in had failed.
  return isLoginPath(value) ? '/' : value;
}
