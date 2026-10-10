import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** `type-is` counts `Content-Length: 0` as a body; a body is there only when something follows the headers. */
function hasBody(request: Request): boolean {
  return (
    request.headers['transfer-encoding'] !== undefined ||
    Number(request.headers['content-length']) > 0
  );
}

/**
 * A request with a body must say it is JSON, because JSON is the only format this API reads. Without this the body of a
 * `text/plain` request is ignored and the call fails later with a confusing validation error; with it the answer is
 * the 415 of RFC 9110 §15.5.16. A request without a body is not touched.
 */
export function requireJsonBody(request: Request, _response: Response, next: NextFunction): void {
  if (hasBody(request) && !request.is('application/json')) {
    next(new UnsupportedMediaTypeException('Send the body as application/json'));
    return;
  }
  next();
}
