import { Subject } from 'rxjs';
import type { DataSource } from 'typeorm';
import type { ApiKeysService } from '../api-keys/api-keys.service.js';
import { ApiKeyAuthService, UNKNOWN_KEY_CACHE_MS } from './api-key-auth.service.js';

const row = {
  id: 'key-1',
  kind: 'server',
  environment_id: 'env-1',
  environment_key: 'dev',
  project_id: 'project-1',
};

describe('ApiKeyAuthService', () => {
  let query: ReturnType<typeof vi.fn>;
  let revoked: Subject<string>;
  let service: ApiKeyAuthService;

  beforeEach(() => {
    vi.useFakeTimers();
    query = vi.fn();
    revoked = new Subject<string>();
    service = new ApiKeyAuthService(
      { query } as unknown as DataSource,
      {
        revoked$: revoked.asObservable(),
      } as unknown as ApiKeysService,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('looks a valid key up once and then serves it from memory', async () => {
    query.mockResolvedValue([row]);

    const first = await service.lookup('hash-a');
    const second = await service.lookup('hash-a');

    expect(first).toEqual({
      keyId: 'key-1',
      kind: 'server',
      environmentId: 'env-1',
      environmentKey: 'dev',
      projectId: 'project-1',
    });
    expect(second).toBe(first);
    expect(service.cached('hash-a')).toBe(first);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('remembers an unknown key only for a few seconds', async () => {
    query.mockResolvedValue([]);

    expect(await service.lookup('hash-x')).toBeNull();
    expect(await service.lookup('hash-x')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(UNKNOWN_KEY_CACHE_MS + 1);
    expect(await service.lookup('hash-x')).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps the unknown-key memory to a few seconds, so a key created right after a miss works', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);

    expect(await service.lookup('hash-new')).toBeNull();
    vi.advanceTimersByTime(UNKNOWN_KEY_CACHE_MS + 1);

    expect(await service.lookup('hash-new')).not.toBeNull();
  });

  it('never caches an unknown key as valid', async () => {
    query.mockResolvedValue([]);
    await service.lookup('hash-x');
    expect(service.cached('hash-x')).toBeUndefined();
  });

  it('drops a key from memory the moment it is revoked', async () => {
    query.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
    await service.lookup('hash-a');

    revoked.next('key-1');

    expect(service.cached('hash-a')).toBeUndefined();
    expect(await service.lookup('hash-a')).toBeNull();
  });

  it('leaves other keys cached when one is revoked', async () => {
    query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...row, id: 'key-2' }]);
    await service.lookup('hash-a');
    await service.lookup('hash-b');

    revoked.next('key-1');

    expect(service.cached('hash-a')).toBeUndefined();
    expect(service.cached('hash-b')).toBeDefined();
  });
});
