/** The part of the Web Locks API we use; a stand-in can be passed in tests. */
export interface LockProvider {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Runs `callback` while holding an exclusive lock called `name` that is shared by every tab of this browser, so
 * only one tab at a time can rotate the refresh token. Without it, two tabs refreshing at the same moment send the
 * same cookie, and the server reads the second as a replayed token and ends the session.
 *
 * Browsers without `navigator.locks` run the callback straight away: tabs are then not coordinated with each other,
 * but concurrent refreshes inside one tab are still shared by the session.
 */
export function withLock<T>(
  name: string,
  callback: () => Promise<T>,
  locks: LockProvider | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks,
): Promise<T> {
  return locks ? locks.request(name, callback) : callback();
}
