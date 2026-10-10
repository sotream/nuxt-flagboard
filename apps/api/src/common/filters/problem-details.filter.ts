import { Catch, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { allowedMethods } from '../http/allowed-methods.js';
import { PROBLEM_CONTENT_TYPE, typeAndTitle } from '../problem/problem-details.js';
import type { ProblemDetails } from '../problem/problem-details.js';

/** Members Nest puts in its own error bodies. `status` is also dropped: it would clash with the problem's `status`. */
const NEST_MEMBERS = new Set(['message', 'error', 'statusCode', 'status']);

/** Errors from Express middleware (body-parser) carry a 4xx `status` but are not Nest exceptions. */
function middlewareStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException || typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const status = (exception as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

function detailOf(message: unknown): string | undefined {
  if (typeof message === 'string') return message;
  return Array.isArray(message) ? message.join('; ') : undefined;
}

function httpExceptionProblem(exception: HttpException): ProblemDetails {
  const status = exception.getStatus();
  const body = exception.getResponse();
  const members = typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code =
    members.code ?? (status === HttpStatus.TOO_MANY_REQUESTS ? 'RATE_LIMITED' : undefined);
  // A server error never repeats its message: this API is public, and such a message could reveal internals.
  const detail =
    status >= 500 ? undefined : detailOf(typeof body === 'string' ? body : members.message);
  const extensions = Object.fromEntries(
    Object.entries(members).filter(([name]) => !NEST_MEMBERS.has(name) && name !== 'code'),
  );
  return {
    ...typeAndTitle(status, code),
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(code === undefined ? {} : { code: String(code) }),
    ...extensions,
  };
}

/** Builds the problem for any exception. Exported for tests; the filter only sends it. */
export function toProblem(exception: unknown): ProblemDetails {
  if (exception instanceof HttpException) return httpExceptionProblem(exception);
  const status = middlewareStatus(exception);
  if (status !== undefined) {
    const detail =
      status === HttpStatus.PAYLOAD_TOO_LARGE ? 'Request body too large' : 'Invalid request body';
    return { ...typeAndTitle(status), status, detail };
  }
  const internal = HttpStatus.INTERNAL_SERVER_ERROR;
  return { ...typeAndTitle(internal), status: internal };
}

/**
 * Answers every error as `application/problem+json` (RFC 9457). Client errors are expected traffic (anyone can send a
 * bad request) and are not logged; anything else is a server error and is.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    let problem = toProblem(exception);
    // Nest answers a route miss with 404 "Cannot METHOD /path". If the path exists for other methods it is a 405, and the
    // response must list them in `Allow` (RFC 9110 §15.5.6).
    if (
      exception instanceof NotFoundException &&
      exception.message === `Cannot ${request.method} ${request.path}`
    ) {
      const allow = allowedMethods(request);
      if (allow.length > 0) {
        response.setHeader('Allow', allow.join(', '));
        problem = {
          ...typeAndTitle(HttpStatus.METHOD_NOT_ALLOWED),
          status: HttpStatus.METHOD_NOT_ALLOWED,
          detail: `${request.method} is not allowed on this path. Allowed: ${allow.join(', ')}.`,
        };
      }
    }
    if (problem.status >= 500 && !(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }
    response
      .status(problem.status)
      .type(PROBLEM_CONTENT_TYPE)
      .send(JSON.stringify({ ...problem, instance: request.originalUrl.split('?')[0] }));
  }
}
