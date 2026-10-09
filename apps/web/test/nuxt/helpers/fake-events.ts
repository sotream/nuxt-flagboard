import { ref } from 'vue';
import type { Ref } from 'vue';
import type { ProjectEventHandlers } from '../../../app/composables/useProjectEvents';
import type { StreamStatus } from '../../../app/utils/event-stream';

/**
 * Stands in for `useProjectEvents` in page tests: it records the handlers a page registered, so a test can play the
 * part of the server pushing a change or the connection coming back.
 */
export function createFakeEvents() {
  const registered: { handlers?: ProjectEventHandlers; status: Ref<StreamStatus> } = {
    status: ref('live'),
  };
  return {
    registered,
    useProjectEvents: (_key: Ref<string>, handlers: ProjectEventHandlers) => {
      registered.handlers = handlers;
      return { status: registered.status };
    },
    push: (
      change: Partial<{
        flagKey: string;
        environmentKey: string | null;
        revision: number | null;
      }> = {},
    ) =>
      registered.handlers?.onChange({
        projectKey: 'demo',
        flagKey: 'new-checkout',
        environmentKey: null,
        revision: null,
        ...change,
      }),
    reconnect: () => registered.handlers?.onReconnected(),
  };
}
export type FakeEvents = ReturnType<typeof createFakeEvents>;
