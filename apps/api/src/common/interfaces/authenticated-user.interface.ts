import type { Role } from '../enums/role.enum.js';

/** The caller, as read from a verified access token. The role can be up to one token lifetime stale. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
