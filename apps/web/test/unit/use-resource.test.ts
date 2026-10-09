import { describe, expect, it } from 'vitest';
import { useResource } from '../../app/composables/useResource';

/** A promise you resolve or reject yourself, to control the order in which answers arrive. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useResource', () => {
  it('loads at once and reports loading, then success with the data', async () => {
    const result = deferred<string[]>();
    const resource = useResource(() => result.promise);
    expect(resource.status.value).toBe('loading');
    expect(resource.data.value).toBeUndefined();

    result.resolve(['a']);
    await tick();

    expect(resource.status.value).toBe('success');
    expect(resource.data.value).toEqual(['a']);
  });

  it('reports an error and keeps the old data when a reload fails', async () => {
    let call = 0;
    const resource = useResource(async () => {
      call += 1;
      if (call === 2) throw new Error('server down');
      return 'first';
    });
    await tick();

    await resource.reload();

    expect(resource.status.value).toBe('error');
    expect(resource.error.value?.message).toBe('server down');
    expect(resource.data.value).toBe('first');
  });

  it('clears the error when a reload succeeds', async () => {
    let call = 0;
    const resource = useResource(async () => {
      call += 1;
      if (call === 1) throw new Error('flaky');
      return 'ok';
    });
    await tick();
    expect(resource.status.value).toBe('error');

    await resource.reload();

    expect(resource.status.value).toBe('success');
    expect(resource.error.value).toBeUndefined();
    expect(resource.data.value).toBe('ok');
  });

  it('ignores an older answer that arrives after a newer request was started', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const answers = [slow, fast];
    let call = 0;
    const resource = useResource(() => answers[call++]!.promise);

    const second = resource.reload(); // the second request is the one that counts
    fast.resolve('new query');
    await second;
    slow.resolve('old query'); // arrives late
    await tick();

    expect(resource.data.value).toBe('new query');
    expect(resource.status.value).toBe('success');
  });

  it('ignores an older failure too', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const answers = [slow, fast];
    let call = 0;
    const resource = useResource(() => answers[call++]!.promise);

    const second = resource.reload();
    fast.resolve('fine');
    await second;
    slow.reject(new Error('late failure'));
    await tick();

    expect(resource.status.value).toBe('success');
    expect(resource.error.value).toBeUndefined();
  });

  it('does not load by itself when asked not to', async () => {
    let calls = 0;
    const resource = useResource(async () => ++calls, { immediate: false });
    await tick();
    expect(calls).toBe(0);
    expect(resource.status.value).toBe('idle');
  });
});
