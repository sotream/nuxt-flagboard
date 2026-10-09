import type { NextFunction, Request, Response } from 'express';

const ONE_DAY_SECONDS = '86400';

/**
 * CORS for `POST /v1/evaluate` and nothing else, so a browser on any origin can use a client key through the SDK.
 *
 * - `Access-Control-Allow-Origin: *` with no credentials: the key travels in the `Authorization` header, never in
 *   a cookie, so allowing every origin gives a page no ambient authority; it still needs a valid key.
 * - The preflight (`OPTIONS`) carries no `Authorization` header by design, so it is answered here, before the API
 *   key guard would reject it. It reveals nothing: the headers are the same for everyone.
 * - The headers are set before the request is handled, so error responses (401, 403, 429) are readable by the
 *   page too. `Retry-After` is exposed for that reason.
 * - `/v1/snapshot` and the admin API get no CORS headers at all.
 */
export function evaluateCors(request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.method !== 'OPTIONS') {
    response.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    next();
    return;
  }
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Max-Age', ONE_DAY_SECONDS);
  response.status(204).end();
}
