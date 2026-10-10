import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { FixedWindowCounter } from '../../infrastructure/rate-limit/fixed-window-counter.js';
import { hashApiKey, isWellFormedApiKey } from '../api-keys/api-key.js';
import type { ApiKeyKind } from '../api-keys/api-key.js';
import { ApiKeyAuthService } from './api-key-auth.service.js';
import type { RequestWithApiKey } from './api-key-principal.js';
import { KEY_KINDS_KEY } from './key-kinds.decorator.js';

const WINDOW_MS = 60_000;

/**
 * Authenticates `/v1/*` requests with `Authorization: Bearer <api key>` and applies two limits:
 * - per key: `API_KEY_RATE_LIMIT_PER_MINUTE` requests a minute;
 * - per client IP: `KEY_AUTH_FAILURE_LIMIT_PER_MINUTE` failed authentications a minute. Once an IP is over it,
 *   keys the server has not seen before get 429 without a database lookup. Keys already known to be valid are
 *   unaffected, so one misconfigured client does not lock out others behind the same address.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly requests = new FixedWindowCounter(WINDOW_MS);
  private readonly failures = new FixedWindowCounter(WINDOW_MS);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: ApiKeyAuthService,
    private readonly env: EnvironmentVariables,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKey>();
    const response = context.switchToHttp().getResponse<Response>();
    const ip = request.ip ?? 'unknown';

    const presented = this.bearerToken(request.headers.authorization);
    if (!presented || !isWellFormedApiKey(presented)) {
      this.fail(ip, response, presented !== undefined);
    }
    const hash = hashApiKey(presented as string);

    let principal = this.auth.cached(hash);
    if (!principal) {
      if (this.failures.peek(ip) >= this.env.KEY_AUTH_FAILURE_LIMIT_PER_MINUTE) {
        this.tooManyRequests(this.failures.retryAfterSeconds(ip), response);
      }
      principal = (await this.auth.lookup(hash)) ?? undefined;
      if (!principal) {
        this.fail(ip, response, true);
      }
    }
    const valid = principal as NonNullable<typeof principal>;

    const allowed = this.reflector.getAllAndOverride<ApiKeyKind[] | undefined>(KEY_KINDS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed?.includes(valid.kind)) {
      throw new ForbiddenException('This kind of API key cannot call this endpoint');
    }
    if (this.requests.hit(valid.keyId) > this.env.API_KEY_RATE_LIMIT_PER_MINUTE) {
      this.tooManyRequests(this.requests.retryAfterSeconds(valid.keyId), response);
    }
    request.apiKey = valid;
    return true;
  }

  /** Records a failed authentication and throws 401, or 429 once the IP is over its limit. */
  private fail(ip: string, response: Response, keyPresented: boolean): never {
    if (this.failures.hit(ip) > this.env.KEY_AUTH_FAILURE_LIMIT_PER_MINUTE) {
      this.tooManyRequests(this.failures.retryAfterSeconds(ip), response);
    }
    // RFC 9110 §15.5.2 and RFC 6750 §3: a challenge always; an error code only when a key was sent.
    response.setHeader(
      'WWW-Authenticate',
      keyPresented ? 'Bearer error="invalid_token"' : 'Bearer',
    );
    throw new UnauthorizedException('Invalid or missing API key');
  }

  private tooManyRequests(retryAfterSeconds: number, response: Response): never {
    response.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  private bearerToken(header: string | undefined): string | undefined {
    const [scheme, token, extra] = header?.split(' ') ?? [];
    return scheme === 'Bearer' && token && extra === undefined ? token : undefined;
  }
}
