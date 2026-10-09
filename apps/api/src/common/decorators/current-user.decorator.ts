import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

export type RequestWithUser = Request & { user?: AuthenticatedUser };

/** The signed-in caller. Only valid on routes that are not `@Public()`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<RequestWithUser>().user;
  if (!user) {
    throw new Error('CurrentUser used on a route without authentication');
  }
  return user;
});
