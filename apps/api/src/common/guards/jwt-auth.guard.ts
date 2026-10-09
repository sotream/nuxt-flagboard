import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import { Role } from '../enums/role.enum.js';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  exp: number;
}

const isRole = (value: unknown): value is Role => value === Role.Admin || value === Role.Viewer;

/**
 * Verifies the Bearer access token from the signature alone: no database lookup per request. The cost is
 * that a role change or a deleted user takes effect when the token expires (at most one token lifetime).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (
      !isRole(payload.role) ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      throw new UnauthorizedException('Invalid access token');
    }
    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      expiresAt: payload.exp * 1000,
    };
    return true;
  }

  private bearerToken(header: string | undefined): string | undefined {
    const [scheme, token] = header?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
