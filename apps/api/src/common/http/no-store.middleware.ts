import type { NextFunction, Request, Response } from 'express';

/**
 * `Cache-Control: no-store` for the admin API (RFC 9111 §5.2.2.5): its responses are per user and some carry an
 * access token, so no cache, shared or private, should keep them. The auth routes also get `Pragma: no-cache`, which is
 * what OAuth 2.0 asks of a token response and what HTTP/1.0 caches understand. The event stream sets its own
 * stronger `Cache-Control`, which replaces this one.
 */
export function noStore(request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  if (request.path.startsWith('/auth/')) response.setHeader('Pragma', 'no-cache');
  next();
}
