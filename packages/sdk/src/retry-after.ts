/** The longest wait taken from a `Retry-After`: a wrong or hostile value must not park a client for days. */
export const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

const DELAY_SECONDS = /^\d{1,9}$/;

/**
 * The wait in milliseconds a `Retry-After` header asks for, or `undefined` when there is none or it is not valid. Both
 * forms of RFC 9110 §10.2.3 are read: `delay-seconds` (a non-negative integer) and an `HTTP-date`, which counts from
 * `now`. A date in the past means no wait. The result is capped at `MAX_RETRY_AFTER_MS`.
 */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (DELAY_SECONDS.test(text)) return Math.min(Number(text) * 1000, MAX_RETRY_AFTER_MS);
  // A date has letters and spaces; numbers with a sign, a fraction or a unit are not dates either.
  if (!/[A-Za-z]/.test(text) || /^\d/.test(text)) return undefined;
  const date = Date.parse(text);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
}
