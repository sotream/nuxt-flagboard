import { describe, expect, it, vi } from 'vitest';
import { withLock } from '../../app/utils/web-lock';
import type { LockProvider } from '../../app/utils/web-lock';

describe('withLock', () => {
  it('runs the callback under a named lock when Web Locks are available', async () => {
    const request = vi.fn(<T>(_name: string, callback: () => Promise<T>) => callback());
    const locks: LockProvider = { request };

    const result = await withLock('refresh', async () => 'done', locks);

    expect(result).toBe('done');
    expect(request).toHaveBeenCalledWith('refresh', expect.any(Function));
  });

  it('runs the callback directly when navigator.locks is missing', async () => {
    const callback = vi.fn(async () => 42);
    expect(await withLock('refresh', callback, undefined)).toBe(42);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('passes a failure of the callback through, with or without locks', async () => {
    const locks: LockProvider = { request: (_name, callback) => callback() };
    const fail = async () => {
      throw new Error('boom');
    };
    await expect(withLock('refresh', fail, locks)).rejects.toThrow('boom');
    await expect(withLock('refresh', fail, undefined)).rejects.toThrow('boom');
  });
});
