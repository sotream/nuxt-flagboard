import { reactive } from 'vue';
import { vi } from 'vitest';
import type { Role } from '../../../app/utils/session';

/** A session whose requests are `vi.fn()`s, for page tests. Change `state.user.role` to test viewers. */
export function createFakeSession(role: Role = 'admin') {
  return {
    state: reactive({
      status: 'authenticated' as 'unknown' | 'authenticated' | 'anonymous',
      user: { id: 'user-1', email: `${role}@example.com`, role } as {
        id: string;
        email: string;
        role: Role;
      } | null,
    }),
    request: vi.fn(),
    authorizedFetch: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    restore: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
  };
}

export type FakeSession = ReturnType<typeof createFakeSession>;
