import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({ session: undefined as unknown }));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));

import { useProjectEvents } from '../../app/composables/useProjectEvents';
import type { ProjectChange } from '../../app/composables/useProjectEvents';

let session: FakeSession;
/** A response whose stream stays open until the request is aborted, like the real one. */
function openStream(...events: string[]) {
  return vi.fn(async (_path: string, init: RequestInit) => {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const event of events) controller.enqueue(encoder.encode(`${event}\n\n`));
          init.signal?.addEventListener('abort', () => controller.close());
        },
      }),
      { status: 200 },
    );
  });
}

function mountWithEvents(projectKey = ref('demo')) {
  const changes: ProjectChange[] = [];
  const reconnected = vi.fn();
  const statuses: string[] = [];
  const Probe = defineComponent({
    setup() {
      const { status } = useProjectEvents(projectKey, {
        onChange: (c) => changes.push(c),
        onReconnected: reconnected,
      });
      return () => h('p', { 'data-status': status.value }, status.value);
    },
  });
  return { mount: () => mountSuspended(Probe), changes, reconnected, statuses, projectKey };
}

beforeEach(() => {
  session = createFakeSession('admin');
  holder.session = session;
});

describe('useProjectEvents', () => {
  it('opens the project stream with the token-carrying fetch and reports each flag change', async () => {
    session.authorizedFetch.mockImplementation(
      openStream(
        'event: ready\ndata: {}',
        'event: flag.changed\ndata: {"projectKey":"demo","flagKey":"a","environmentKey":"dev","revision":4}',
      ),
    );
    const { mount, changes } = mountWithEvents();
    const wrapper = await mount();
    await flushPromises();

    expect(session.authorizedFetch).toHaveBeenCalledWith(
      '/api/v1/projects/demo/events',
      expect.objectContaining({ headers: { Accept: 'text/event-stream' } }),
    );
    expect(changes).toEqual([
      { projectKey: 'demo', flagKey: 'a', environmentKey: 'dev', revision: 4 },
    ]);
    expect(wrapper.get('[data-status]').attributes('data-status')).toBe('live');
    wrapper.unmount();
  });

  it('ignores the ready event, heartbeats, unknown events and malformed data', async () => {
    session.authorizedFetch.mockImplementation(
      openStream(
        'event: ready\ndata: {}',
        'event: heartbeat\ndata: {}',
        'event: flag.changed\ndata: not json',
        'event: flag.changed\ndata: {"nope":true}',
        'event: other\ndata: {"flagKey":"x"}',
        'event: flag.changed\ndata: {"projectKey":"demo","flagKey":"ok","environmentKey":null,"revision":null}',
      ),
    );
    const { mount, changes } = mountWithEvents();
    const wrapper = await mount();
    await flushPromises();

    expect(changes.map((c) => c.flagKey)).toEqual(['ok']);
    wrapper.unmount();
  });

  it('closes the stream when the component goes away', async () => {
    let signal: AbortSignal | undefined;
    session.authorizedFetch.mockImplementation(async (_path: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return openStream('event: ready\ndata: {}')(_path, init);
    });
    const { mount } = mountWithEvents();
    const wrapper = await mount();
    await flushPromises();
    expect(signal?.aborted).toBe(false);

    wrapper.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("switches to the new project's stream when the project changes", async () => {
    session.authorizedFetch.mockImplementation(openStream('event: ready\ndata: {}'));
    const { mount, projectKey } = mountWithEvents();
    const wrapper = await mount();
    await flushPromises();

    projectKey.value = 'other';
    await flushPromises();

    const paths = session.authorizedFetch.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(['/api/v1/projects/demo/events', '/api/v1/projects/other/events']);
    wrapper.unmount();
  });

  it('encodes the project key in the URL', async () => {
    session.authorizedFetch.mockImplementation(openStream('event: ready\ndata: {}'));
    const { mount } = mountWithEvents(ref('a/b c'));
    const wrapper = await mount();
    await flushPromises();
    expect(session.authorizedFetch.mock.calls[0]![0]).toBe('/api/v1/projects/a%2Fb%20c/events');
    wrapper.unmount();
  });
});
