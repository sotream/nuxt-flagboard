import { STATUS_CODES } from 'node:http';

/**
 * Error responses follow RFC 9457 (problem details for HTTP APIs): `application/problem+json` with `type`, `title`,
 * `status`, `detail` and `instance`. Our own members are extensions, which clients must ignore when they do not know
 * them: `code` (a stable machine-readable name), `errors` (every invalid field of a request) and `current` (the
 * current state in a revision conflict).
 */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** The problem types we define. Everything else is a plain HTTP error and uses the default type `about:blank`. */
export const PROBLEM_TYPES = {
  VALIDATION_FAILED: {
    type: 'urn:flagboard:problem:validation-failed',
    title: 'Validation failed',
  },
  REVISION_MISMATCH: {
    type: 'urn:flagboard:problem:revision-mismatch',
    title: 'Revision mismatch',
  },
  RATE_LIMITED: { type: 'urn:flagboard:problem:rate-limited', title: 'Too many requests' },
} as const;

export type ProblemCode = keyof typeof PROBLEM_TYPES;

/** One invalid field. `pointer` is a JSON Pointer in URI fragment form (`#/rules/0/serve`), as in the RFC's example. */
export interface FieldError {
  pointer: string;
  detail: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: FieldError[];
  [extension: string]: unknown;
}

const isProblemCode = (code: unknown): code is ProblemCode =>
  typeof code === 'string' && code in PROBLEM_TYPES;

/** `type` and `title` for a status and an optional code: ours if we defined one, else `about:blank` and the HTTP reason. */
export function typeAndTitle(
  status: number,
  code?: unknown,
): Pick<ProblemDetails, 'type' | 'title'> {
  if (isProblemCode(code)) return PROBLEM_TYPES[code];
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error' };
}

/** A JSON Pointer reference token escapes `~` and `/` (RFC 6901). */
export const pointerToken = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');
