import { SetMetadata } from '@nestjs/common';
import type { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';

/** Roles allowed on a route. Without it, reading is open to any signed-in user and writing is admin only. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
