<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from '#imports';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { AuditEventView, AuditPage, FlagView } from '~/utils/api-types';
import { actionLabel, describeChanges } from '~/utils/audit-format';
import { formatDateTime } from '~/utils/format';

const PAGE_SIZE = 25;

const route = useRoute();
const session = useSession();
const project = computed(() => encodeURIComponent(String(route.params.project)));

// The flags only feed the filter list; the audit log itself does not depend on them.
const flags = useResource(() =>
  session.request<FlagView[]>(`/api/v1/projects/${project.value}/flags`, {
    query: { includeArchived: true },
  }),
);
const flagFilter = ref('');

const first = useResource(() =>
  session.request<AuditPage>(`/api/v1/projects/${project.value}/audit`, {
    query: { flagKey: flagFilter.value || undefined, limit: PAGE_SIZE },
  }),
);
const more = ref<AuditEventView[]>([]);
const cursor = ref<string | null>(null);
const loadingMore = ref(false);
const moreError = ref('');

watch(
  () => first.data.value,
  (page) => {
    more.value = [];
    cursor.value = page?.nextCursor ?? null;
  },
);
watch(flagFilter, () => void first.reload());

const events = computed(() => [...(first.data.value?.items ?? []), ...more.value]);

async function loadMore(): Promise<void> {
  if (!cursor.value || loadingMore.value) return;
  const forFilter = flagFilter.value;
  loadingMore.value = true;
  moreError.value = '';
  try {
    const page = await session.request<AuditPage>(`/api/v1/projects/${project.value}/audit`, {
      query: { flagKey: forFilter || undefined, limit: PAGE_SIZE, cursor: cursor.value },
    });
    if (forFilter !== flagFilter.value) return; // the filter changed while this was loading
    more.value = [...more.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (problem) {
    moreError.value = problem instanceof ApiError ? problem.message : 'Could not load more events.';
  } finally {
    loadingMore.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="audit-title">
    <h2 id="audit-title" class="text-xl font-semibold">Audit log</h2>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
      Who changed what, newest first. Entries cannot be edited or deleted.
    </p>

    <div class="mt-4">
      <label for="audit-flag" class="block text-sm font-medium">Show</label>
      <select
        id="audit-flag"
        v-model="flagFilter"
        class="mt-1 block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="">All changes</option>
        <option v-for="flag in flags.data.value ?? []" :key="flag.key" :value="flag.key">
          {{ flag.name }} ({{ flag.key }})
        </option>
      </select>
    </div>

    <div class="mt-4">
      <ResourceState
        label="the audit log"
        :status="first.status.value"
        :has-data="first.data.value !== undefined"
        :empty="events.length === 0"
        :error="first.error.value?.message"
        empty-title="Nothing has happened yet"
        :empty-hint="
          flagFilter
            ? 'There are no changes for this flag.'
            : 'Changes to flags and keys will appear here.'
        "
        @retry="first.reload()"
      >
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Changes in this project, newest first
            </caption>
            <thead class="bg-slate-100 text-xs uppercase dark:bg-slate-800">
              <tr>
                <th scope="col" class="px-3 py-2">When</th>
                <th scope="col" class="px-3 py-2">Who</th>
                <th scope="col" class="px-3 py-2">What</th>
                <th scope="col" class="px-3 py-2">Flag</th>
                <th scope="col" class="px-3 py-2">Environment</th>
                <th scope="col" class="px-3 py-2">Changes</th>
              </tr>
            </thead>
            <tbody
              class="divide-y divide-slate-200 bg-white align-top dark:divide-slate-800 dark:bg-slate-900"
            >
              <tr v-for="event in events" :key="event.id">
                <td class="whitespace-nowrap px-3 py-2">
                  <time :datetime="event.createdAt">{{ formatDateTime(event.createdAt) }}</time>
                </td>
                <td class="px-3 py-2">{{ event.actorEmail }}</td>
                <td class="px-3 py-2">{{ actionLabel(event) }}</td>
                <td class="px-3 py-2 font-mono text-xs">
                  <NuxtLink
                    v-if="event.flagKey"
                    :to="`/projects/${project}/flags/${encodeURIComponent(event.flagKey)}`"
                    class="underline"
                  >
                    {{ event.flagKey }}
                  </NuxtLink>
                  <span v-else aria-label="none">—</span>
                </td>
                <td class="px-3 py-2 font-mono text-xs uppercase">
                  {{ event.environmentKey ?? '—' }}
                </td>
                <td class="px-3 py-2">
                  <ul class="space-y-0.5">
                    <li v-for="change in describeChanges(event)" :key="change.field">
                      <span class="font-medium">{{ change.label }}:</span>
                      <span class="text-slate-600 dark:text-slate-400">{{ change.before }}</span>
                      <span aria-label="changed to">→</span>
                      <span>{{ change.after }}</span>
                    </li>
                  </ul>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
                      Raw data<span class="sr-only"> for this change</span>
                    </summary>
                    <pre
                      class="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800"
                      >{{
                        JSON.stringify({ before: event.before, after: event.after }, null, 2)
                      }}</pre>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4">
          <p v-if="moreError" role="alert" class="mb-2 text-sm text-red-700 dark:text-red-300">
            {{ moreError }}
          </p>
          <button
            v-if="cursor"
            type="button"
            :disabled="loadingMore"
            class="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            @click="loadMore"
          >
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </button>
          <p v-else-if="events.length > 0" class="text-sm text-slate-500 dark:text-slate-400">
            That is everything.
          </p>
        </div>
      </ResourceState>
    </div>
  </section>
</template>
