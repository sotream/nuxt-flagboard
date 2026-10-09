import { reactive } from 'vue';
import { ApiError } from './api-error';
import type { FlagEnvironmentView } from './api-types';
import { changedFields, draftFrom, pick } from './flag-editor';
import type { Draft, DraftField } from './flag-editor';

/** Sends one request about this environment and returns its new state. Supplied by the page. */
export type SendEnvironmentRequest = (
  method: 'PATCH' | 'POST',
  suffix: '' | '/kill-switch' | '/kill-switch/release',
  body: object,
) => Promise<FlagEnvironmentView>;

/**
 * Someone else changed this environment while this person was working. Nothing the person typed is thrown away:
 * the draft stays, and they choose between the latest state and their edits on top of it.
 */
export interface Conflict {
  /** The state on the server now. */
  current: FlagEnvironmentView;
  /** The state this person's draft was based on. */
  base: FlagEnvironmentView;
  /** What the failed request tried to change (empty when the conflict was noticed, not caused). */
  attempt: Partial<Draft>;
  /** Repeats the failed action against the new revision (kill switch actions), when there is one. */
  retry?: () => Promise<void>;
  /** What the failed action was, in words, when it is not an edit of the draft ("Switch the kill switch on"). */
  description?: string;
}

/**
 * The editing state of one environment of one flag: the last state seen on the server, the draft being edited,
 * whether a request is running, and any conflict. All writes carry the revision they were based on; a 409 turns
 * into a `conflict` instead of an error.
 */
export function createEnvEditor(initial: FlagEnvironmentView, send: SendEnvironmentRequest) {
  const state = reactive({
    server: initial,
    draft: draftFrom(initial),
    saving: false,
    error: '',
    conflict: null as Conflict | null,
  });

  const dirtyFields = (): DraftField[] => changedFields(state.draft, draftFrom(state.server));

  function conflictFrom(problem: unknown): FlagEnvironmentView | undefined {
    if (problem instanceof ApiError && problem.status === 409) {
      return (problem.body as { current?: FlagEnvironmentView } | undefined)?.current;
    }
    return undefined;
  }

  /** Runs one write. Returns the new state, or undefined when it failed (error or conflict is set). */
  async function run(
    action: () => Promise<FlagEnvironmentView>,
    onConflict: (current: FlagEnvironmentView) => Conflict,
  ): Promise<FlagEnvironmentView | undefined> {
    if (state.saving) return undefined;
    state.saving = true;
    state.error = '';
    try {
      return await action();
    } catch (problem) {
      const current = conflictFrom(problem);
      if (current) {
        state.conflict = onConflict(current);
      } else {
        state.error = problem instanceof ApiError ? problem.message : 'Could not save the change.';
      }
      return undefined;
    } finally {
      state.saving = false;
    }
  }

  /** Writes some fields of the draft. The other fields of the draft stay as they are, unsaved. */
  async function patch(fields: DraftField[]): Promise<boolean> {
    const attempt = pick(state.draft, fields);
    const base = state.server;
    const saved = await run(
      () => send('PATCH', '', { revision: state.server.revision, ...attempt }),
      (current) => ({ current, base, attempt }),
    );
    if (!saved) return false;
    state.server = saved;
    for (const field of fields) {
      (state.draft as Record<DraftField, unknown>)[field] = draftFrom(saved)[field];
    }
    return true;
  }

  return {
    state,
    dirtyFields,

    /** The switch: saved at once, on its own, without touching other unsaved edits. */
    async toggle(enabled: boolean): Promise<void> {
      state.draft.enabled = enabled;
      const saved = await patch(['enabled']);
      // A failure that is not a conflict puts the switch back. A conflict keeps it as an unsaved edit.
      if (!saved && !state.conflict) state.draft.enabled = state.server.enabled;
    },

    /** Saves every field that differs from the server. */
    async save(): Promise<boolean> {
      const fields = dirtyFields();
      return fields.length === 0 ? true : patch(fields);
    },

    /** Throws the draft away. */
    discard(): void {
      state.draft = draftFrom(state.server);
      state.error = '';
    },

    async engageKillSwitch(reason: string): Promise<boolean> {
      const attempt = async (): Promise<boolean> => {
        const base = state.server;
        const saved = await run(
          () => send('POST', '/kill-switch', { revision: state.server.revision, reason }),
          (current) => ({
            current,
            base,
            attempt: {},
            retry: async () => void (await attempt()),
            description: 'Switch the kill switch on',
          }),
        );
        if (saved) state.server = saved;
        return saved !== undefined;
      };
      return attempt();
    },

    async releaseKillSwitch(): Promise<boolean> {
      const attempt = async (): Promise<boolean> => {
        const base = state.server;
        const saved = await run(
          () => send('POST', '/kill-switch/release', { revision: state.server.revision }),
          (current) => ({
            current,
            base,
            attempt: {},
            retry: async () => void (await attempt()),
            description: 'Release the kill switch',
          }),
        );
        if (saved) state.server = saved;
        return saved !== undefined;
      };
      return attempt();
    },

    /** Conflict: show what the server has now and drop this person's edits. */
    loadLatest(): void {
      if (!state.conflict) return;
      state.server = state.conflict.current;
      state.draft = draftFrom(state.server);
      state.conflict = null;
    },

    /**
     * Conflict: keep the edits, but base them on the latest state. Edits are not saved by this; the person reviews
     * what changed and saves again. A kill switch action, which has no draft, is repeated against the new revision.
     */
    async applyMineOnLatest(): Promise<void> {
      const conflict = state.conflict;
      if (!conflict) return;
      // Only what this person changed stays theirs; every other field follows the latest state, so the other
      // person's changes are not silently undone.
      const mine = changedFields(state.draft, draftFrom(conflict.base));
      const next = draftFrom(conflict.current);
      for (const field of mine) {
        (next as Record<DraftField, unknown>)[field] = state.draft[field];
      }
      state.server = conflict.current;
      state.draft = next;
      state.conflict = null;
      await conflict.retry?.();
    },

    /**
     * News from outside (a live update, a reload): the server has a newer state. Without edits in progress the
     * screen simply updates. With edits, nothing is overwritten and a conflict is raised for the person to resolve.
     */
    receiveRemote(current: FlagEnvironmentView): void {
      if (current.revision <= state.server.revision) return;
      // A save of our own is running: its answer will carry the newest state, and if somebody else's change got in
      // first, the save itself will be rejected with a conflict. Treating this as a conflict now would be a false alarm
      // (the live update of our own change can arrive before the answer to the request).
      if (state.saving) return;
      if (dirtyFields().length === 0) {
        state.server = current;
        state.draft = draftFrom(current);
        state.conflict = null;
        return;
      }
      state.conflict = {
        current,
        base: state.conflict?.base ?? state.server,
        attempt: state.conflict?.attempt ?? {},
      };
    },
  };
}

export type EnvEditor = ReturnType<typeof createEnvEditor>;
