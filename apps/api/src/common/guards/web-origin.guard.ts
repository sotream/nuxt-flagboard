import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';

/**
 * Cookie endpoints accept requests from the configured web origin only. A missing `Origin` header is
 * rejected as well: browsers always send it on cross-site POSTs, so its absence means a non-browser client,
 * and those have no use for a cookie-based flow. This is the CSRF defence on top of `SameSite=Lax`.
 */
@Injectable()
export class WebOriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(env: EnvironmentVariables) {
    this.allowedOrigin = new URL(env.WEB_ORIGIN).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== this.allowedOrigin) {
      throw new ForbiddenException('Origin not allowed');
    }
    return true;
  }
}
