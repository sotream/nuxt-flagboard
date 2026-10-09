import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { runEventStream } from '~/utils/event-stream';
import type { StreamStatus } from '~/utils/event-stream';
import { useSession } from './useSession';

/** What the stream says: something in a project changed. It is a hint, so the page reads the data again. */
export interface ProjectChange {
  projectKey: string;
  flagKey: string;
  /** Null when the change touches every environment (a new, renamed or archived flag). */
  environmentKey: string | null;
  /** The new revision of that environment, when there is one. */
  revision: number | null;
}

export interface ProjectEventHandlers {
  onChange: (change: ProjectChange) => void;
  /** The stream was lost and is back: events may have been missed, so reload. */
  onReconnected: () => void;
}

const isChange = (value: unknown): value is ProjectChange =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ProjectChange).flagKey === 'string';

/**
 * Keeps a live-update stream open for a project while the component is mounted. The stream is read with `fetch`
 * (not EventSource) so it can carry the access token, and it reconnects by itself; see `runEventStream`.
 */
export function useProjectEvents(
  projectKey: Ref<string>,
  handlers: ProjectEventHandlers,
): { status: Ref<StreamStatus> } {
  const session = useSession();
  const status = ref<StreamStatus>('connecting');
  let controller: AbortController | undefined;

  function start(): void {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    const path = `/api/v1/projects/${encodeURIComponent(projectKey.value)}/events`;
    void runEventStream({
      signal: mine.signal,
      open: (signal) =>
        session.authorizedFetch(path, { headers: { Accept: 'text/event-stream' }, signal }),
      onMessage: (message) => {
        if (message.type !== 'flag.changed') return;
        try {
          const change: unknown = JSON.parse(message.data);
          if (isChange(change)) handlers.onChange(change);
        } catch {
          // a malformed event is ignored: the next one, or the next reload, brings the page up to date
        }
      },
      onStatus: (next) => {
        if (!mine.signal.aborted) status.value = next;
      },
      onReconnected: handlers.onReconnected,
    });
  }

  onMounted(start);
  watch(projectKey, () => {
    status.value = 'connecting';
    start();
  });
  onBeforeUnmount(() => controller?.abort());
  return { status };
}
