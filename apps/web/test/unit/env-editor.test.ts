import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import type { FlagEnvironmentView, Rule } from '../../app/utils/api-types';
import { createEnvEditor } from '../../app/utils/env-editor';
import type { SendEnvironmentRequest } from '../../app/utils/env-editor';
import { environment } from './flag-editor.test';

const rule: Rule = {
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
  serve: 'on',
};
const conflict = (current: FlagEnvironmentView) =>
  new ApiError(409, 'Someone else changed this first', { code: 'REVISION_MISMATCH', current });

/** A fake server for one environment: applies what it is sent, bumping the revision, and can be made to conflict. */
function fakeServer(initial: FlagEnvironmentView) {
  let current = initial;
  const calls: { method: string; suffix: string; body: Record<string, unknown> }[] = [];
  const send: SendEnvironmentRequest = vi.fn(async (method, suffix, body) => {
    calls.push({ method, suffix, body: body as Record<string, unknown> });
    const { revision, reason, ...fields } = body as Record<string, unknown> & {
      revision: number;
      reason?: string;
    };
    if (revision !== current.revision) throw conflict(current);
    if (suffix === '/kill-switch')
      current = {
        ...current,
        killSwitch: true,
        killReason: reason ?? null,
        revision: current.revision + 1,
      };
    else if (suffix === '/kill-switch/release')
      current = { ...current, killSwitch: false, killReason: null, revision: current.revision + 1 };
    else current = { ...current, ...fields, revision: current.revision + 1 };
    return current;
  });
  return {
    send,
    calls,
    get current() {
      return current;
    },
    /** Someone else changes the environment. */
    elsewhere: (change: Partial<FlagEnvironmentView>) => {
      current = { ...current, ...change, revision: current.revision + 1 };
      return current;
    },
  };
}

describe('toggle', () => {
  it('saves the switch at once with the current revision', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);

    await editor.toggle(true);

    expect(server.calls).toEqual([
      { method: 'PATCH', suffix: '', body: { revision: 1, enabled: true } },
    ]);
    expect(editor.state.server).toMatchObject({ enabled: true, revision: 2 });
    expect(editor.state.draft.enabled).toBe(true);
    expect(editor.dirtyFields()).toEqual([]);
  });

  it('shows the new position while saving, and prevents a second request in the meantime', async () => {
    let release!: (value: FlagEnvironmentView) => void;
    const send = vi.fn(() => new Promise<FlagEnvironmentView>((resolve) => (release = resolve)));
    const editor = createEnvEditor(environment(), send);

    const first = editor.toggle(true);
    expect(editor.state.saving).toBe(true);
    expect(editor.state.draft.enabled).toBe(true);
    await editor.toggle(false); // ignored: a save is running
    expect(send).toHaveBeenCalledTimes(1);

    release(environment({ enabled: true, revision: 2 }));
    await first;
    expect(editor.state.saving).toBe(false);
  });

  it('leaves other unsaved edits alone', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 30;

    await editor.toggle(true);

    expect(server.calls[0]!.body).toEqual({ revision: 1, enabled: true }); // not the rollout
    expect(editor.state.draft.rolloutPercentage).toBe(30);
    expect(editor.dirtyFields()).toEqual(['rolloutPercentage']);
  });

  it('puts the switch back and shows the error when the save fails', async () => {
    const send = vi.fn(async () => {
      throw new ApiError(500, 'The server failed');
    });
    const editor = createEnvEditor(environment(), send);

    await editor.toggle(true);

    expect(editor.state.draft.enabled).toBe(false);
    expect(editor.state.error).toBe('The server failed');
    expect(editor.state.conflict).toBeNull();
  });

  it('keeps the switch as an unsaved edit when someone else got there first', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    server.elsewhere({ rolloutPercentage: 50 });

    await editor.toggle(true);

    expect(editor.state.conflict?.current).toMatchObject({ rolloutPercentage: 50, revision: 2 });
    expect(editor.state.conflict?.attempt).toEqual({ enabled: true });
    expect(editor.state.draft.enabled).toBe(true);
    expect(editor.state.server.revision).toBe(1); // not adopted until the person decides
  });
});

describe('save', () => {
  it('sends only the fields that changed', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 40;
    editor.state.draft.rules = [rule];

    expect(await editor.save()).toBe(true);

    expect(server.calls[0]!.body).toEqual({ revision: 1, rolloutPercentage: 40, rules: [rule] });
    expect(editor.dirtyFields()).toEqual([]);
    expect(editor.state.server.revision).toBe(2);
  });

  it('does nothing when nothing changed', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    expect(await editor.save()).toBe(true);
    expect(server.calls).toEqual([]);
  });

  it('discard drops the edits', () => {
    const server = fakeServer(environment({ rolloutPercentage: 10 }));
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 90;
    editor.discard();
    expect(editor.state.draft.rolloutPercentage).toBe(10);
  });

  it('on a conflict keeps every edit and raises a conflict with the current state', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 40;
    editor.state.draft.rules = [rule];
    server.elsewhere({ enabled: true });

    expect(await editor.save()).toBe(false);

    expect(editor.state.draft.rolloutPercentage).toBe(40);
    expect(editor.state.draft.rules).toEqual([rule]);
    expect(editor.state.conflict?.current).toMatchObject({ enabled: true, revision: 2 });
    expect(editor.state.conflict?.base.revision).toBe(1);
    expect(editor.state.conflict?.attempt).toEqual({ rolloutPercentage: 40, rules: [rule] });
    expect(editor.state.error).toBe('');
  });
});

describe('resolving a conflict', () => {
  async function conflicted() {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 40;
    server.elsewhere({ enabled: true });
    await editor.save();
    return { server, editor };
  }

  it('"load latest" shows the server state and drops the edits', async () => {
    const { editor } = await conflicted();

    editor.loadLatest();

    expect(editor.state.server).toMatchObject({ enabled: true, revision: 2 });
    expect(editor.state.draft).toMatchObject({ enabled: true, rolloutPercentage: 0 });
    expect(editor.state.conflict).toBeNull();
    expect(editor.dirtyFields()).toEqual([]);
  });

  it('"apply my edits on latest" keeps the edits on top of the new state, unsaved, and the next save succeeds', async () => {
    const { server, editor } = await conflicted();

    await editor.applyMineOnLatest();

    expect(editor.state.server.revision).toBe(2);
    expect(editor.state.draft.rolloutPercentage).toBe(40);
    expect(editor.state.draft.enabled).toBe(true); // the other person's change is visible too
    expect(editor.dirtyFields()).toEqual(['rolloutPercentage']);
    expect(server.calls).toHaveLength(1); // nothing was sent yet: the person reviews first

    expect(await editor.save()).toBe(true);
    expect(server.calls.at(-1)!.body).toEqual({ revision: 2, rolloutPercentage: 40 });
    expect(server.current).toMatchObject({ enabled: true, rolloutPercentage: 40, revision: 3 });
  });

  it('a field that now equals the server value stops counting as an edit', async () => {
    const { server, editor } = await conflicted();
    server.elsewhere({ rolloutPercentage: 40 }); // the other person set the same rollout
    await editor.save().catch(() => undefined);

    await editor.applyMineOnLatest();

    expect(editor.dirtyFields()).toEqual([]);
  });

  it('does nothing when there is no conflict', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.loadLatest();
    await editor.applyMineOnLatest();
    expect(editor.state.server.revision).toBe(1);
  });
});

describe('kill switch', () => {
  it('engages with a reason and adopts the new state', async () => {
    const server = fakeServer(environment({ enabled: true }));
    const editor = createEnvEditor(server.current, server.send);

    expect(await editor.engageKillSwitch('Incident 42')).toBe(true);

    expect(server.calls[0]).toEqual({
      method: 'POST',
      suffix: '/kill-switch',
      body: { revision: 1, reason: 'Incident 42' },
    });
    expect(editor.state.server).toMatchObject({
      killSwitch: true,
      killReason: 'Incident 42',
      revision: 2,
    });
  });

  it('releases it', async () => {
    const server = fakeServer(environment({ killSwitch: true, killReason: 'x' }));
    const editor = createEnvEditor(server.current, server.send);

    expect(await editor.releaseKillSwitch()).toBe(true);

    expect(server.calls[0]).toEqual({
      method: 'POST',
      suffix: '/kill-switch/release',
      body: { revision: 1 },
    });
    expect(editor.state.server.killSwitch).toBe(false);
  });

  it('on a conflict, "apply my change on latest" repeats the action against the new revision', async () => {
    const server = fakeServer(environment({ enabled: true }));
    const editor = createEnvEditor(server.current, server.send);
    server.elsewhere({ rolloutPercentage: 20 });

    expect(await editor.engageKillSwitch('Incident')).toBe(false);
    expect(editor.state.conflict?.retry).toBeDefined();
    await editor.applyMineOnLatest();

    expect(server.current).toMatchObject({
      killSwitch: true,
      killReason: 'Incident',
      rolloutPercentage: 20,
      revision: 3,
    });
    expect(editor.state.server.killSwitch).toBe(true);
    expect(editor.state.conflict).toBeNull();
  });

  it('on a conflict, "load latest" abandons the action', async () => {
    const server = fakeServer(environment({ enabled: true }));
    const editor = createEnvEditor(server.current, server.send);
    server.elsewhere({ killSwitch: true, killReason: 'someone else' });

    await editor.engageKillSwitch('mine');
    editor.loadLatest();

    expect(editor.state.server).toMatchObject({ killSwitch: true, killReason: 'someone else' });
    expect(server.calls).toHaveLength(1);
  });
});

describe('receiveRemote (live updates)', () => {
  it('quietly shows a newer state when there are no edits', () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);

    editor.receiveRemote(environment({ enabled: true, revision: 2 }));

    expect(editor.state.server).toMatchObject({ enabled: true, revision: 2 });
    expect(editor.state.draft.enabled).toBe(true);
    expect(editor.state.conflict).toBeNull();
  });

  it('raises a conflict instead of overwriting edits in progress', () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 60;

    editor.receiveRemote(environment({ enabled: true, revision: 2 }));

    expect(editor.state.draft.rolloutPercentage).toBe(60);
    expect(editor.state.server.revision).toBe(1);
    expect(editor.state.conflict?.current.revision).toBe(2);
  });

  it('ignores a state that is not newer, such as the echo of its own save', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    await editor.toggle(true);

    editor.receiveRemote(environment({ enabled: true, revision: 2 }));
    editor.receiveRemote(environment({ revision: 1 }));

    expect(editor.state.conflict).toBeNull();
    expect(editor.state.server.revision).toBe(2);
  });

  it('does not raise a false conflict while its own save is running, which the live update of that very save can beat', async () => {
    let release!: (value: FlagEnvironmentView) => void;
    const send = vi.fn(() => new Promise<FlagEnvironmentView>((resolve) => (release = resolve)));
    const editor = createEnvEditor(environment(), send);

    const saving = editor.toggle(true);
    editor.receiveRemote(environment({ enabled: true, revision: 2 })); // the event arrives first
    expect(editor.state.conflict).toBeNull();

    release(environment({ enabled: true, revision: 2 }));
    await saving;
    expect(editor.state.conflict).toBeNull();
    expect(editor.state.server.revision).toBe(2);
  });

  it('keeps the base of an existing conflict when yet another change arrives', async () => {
    const server = fakeServer(environment());
    const editor = createEnvEditor(server.current, server.send);
    editor.state.draft.rolloutPercentage = 60;
    editor.receiveRemote(environment({ enabled: true, revision: 2 }));

    editor.receiveRemote(environment({ enabled: true, rolloutPercentage: 5, revision: 3 }));

    expect(editor.state.conflict?.current.revision).toBe(3);
    expect(editor.state.conflict?.base.revision).toBe(1);
  });
});
