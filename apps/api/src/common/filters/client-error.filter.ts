import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

/** Errors from Express middleware (body-parser) carry a 4xx `status` but are not Nest exceptions. */
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException || typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const status = (exception as { status?: unknown; statusCode?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/**
 * Answers a too-large or malformed request body with its 4xx status and a short JSON message, instead of letting
 * the default filter log it as a server error. Anyone can send such a request, so it must not fill the logs.
 * Everything else is handled as usual.
 */
@Catch()
export class ClientErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = clientErrorStatus(exception);
    if (status === undefined) {
      super.catch(exception, host);
      return;
    }
    const message =
      status === HttpStatus.PAYLOAD_TOO_LARGE ? 'Request body too large' : 'Invalid request body';
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
