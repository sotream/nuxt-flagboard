import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import { Role } from '../enums/role.enum.js';

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Least privilege by default: without `@Roles()`, reading is open to any signed-in user and every other method
 * needs the admin role. A route that should be open to viewers beyond reading must say so explicitly.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException();
    }
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const permitted = allowed
      ? allowed.includes(user.role)
      : READ_METHODS.has(request.method) || user.role === Role.Admin;
    if (!permitted) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
