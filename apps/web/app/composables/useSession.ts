import { createSession } from '~/utils/session';
import type { Session } from '~/utils/session';

let session: Session | undefined;

/** The one session of this browser tab, created on first use. */
export function useSession(): Session {
  session ??= createSession({ fetch: (input, init) => fetch(input, init) });
  return session;
}
