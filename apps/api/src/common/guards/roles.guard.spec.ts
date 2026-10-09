import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(
  method: string,
  role: Role | undefined,
  metadata: { roles?: Role[]; isPublic?: boolean } = {},
): ExecutionContext {
  const handler = () => undefined;
  class Controller {}
  if (metadata.roles) Reflect.defineMetadata('roles', metadata.roles, handler);
  if (metadata.isPublic) Reflect.defineMetadata('isPublic', true, handler);
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => ({ method, user: role ? { id: 'u', email: 'e', role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it.each([
    ['GET', Role.Viewer, true],
    ['HEAD', Role.Viewer, true],
    ['POST', Role.Viewer, false],
    ['PATCH', Role.Viewer, false],
    ['DELETE', Role.Viewer, false],
    ['GET', Role.Admin, true],
    ['POST', Role.Admin, true],
    ['DELETE', Role.Admin, true],
  ])('with no @Roles(), %s as %s is allowed: %s', (method, role, allowed) => {
    const context = contextFor(method, role);
    if (allowed) expect(guard.canActivate(context)).toBe(true);
    else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('follows an explicit @Roles() list over the default', () => {
    expect(guard.canActivate(contextFor('POST', Role.Viewer, { roles: [Role.Viewer] }))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor('GET', Role.Viewer, { roles: [Role.Admin] })),
    ).toThrow(ForbiddenException);
  });

  it('lets public routes through without a user', () => {
    expect(guard.canActivate(contextFor('POST', undefined, { isPublic: true }))).toBe(true);
  });

  it('refuses a route that is not public when there is no user', () => {
    expect(() => guard.canActivate(contextFor('GET', undefined))).toThrow(ForbiddenException);
  });
});
