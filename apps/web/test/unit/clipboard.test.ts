import { afterEach, describe, expect, it, vi } from 'vitest';

describe('copyText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the clipboard API when it is there', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { copyText } = await import('../../app/utils/clipboard');

    expect(await copyText('fb_srv_secret')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('fb_srv_secret');
  });

  it('falls back to selecting a hidden field when the API refuses, and cleans up after itself', async () => {
    const execCommand = vi.fn(() => true);
    const appended: unknown[] = [];
    const field = {
      value: '',
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    vi.stubGlobal('document', {
      createElement: () => field,
      body: { appendChild: (node: unknown) => appended.push(node) },
      execCommand,
    });
    const { copyText } = await import('../../app/utils/clipboard');

    expect(await copyText('the key')).toBe(true);
    expect(field.value).toBe('the key');
    expect(field.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(field.remove).toHaveBeenCalled();
  });

  it('reports false when nothing could be copied', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: () => ({ style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() }),
      body: { appendChild: vi.fn() },
      execCommand: () => {
        throw new Error('not allowed');
      },
    });
    const { copyText } = await import('../../app/utils/clipboard');
    expect(await copyText('x')).toBe(false);
  });
});
