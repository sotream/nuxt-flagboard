/** A project key from a name: lower-case letters and digits separated by single dashes, at most 64 characters. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop accents: "café" -> "cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

/** Same rule as the API: lower-case letters and digits separated by single dashes. */
export const PROJECT_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The API's rule for flag keys: lower-case letters and digits separated by single dots, dashes or underscores. */
export const FLAG_KEY_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
