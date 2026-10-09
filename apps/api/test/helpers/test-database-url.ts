/**
 * Points a connection string at the `<name>_test` database, so e2e runs never touch development data.
 * A url that already names a `_test` database (as in CI) is left as it is.
 */
export function toTestDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    parsed.pathname = `/${name}_test`;
  }
  return parsed.toString();
}
