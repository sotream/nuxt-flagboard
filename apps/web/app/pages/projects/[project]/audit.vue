<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from '#imports';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { AuditEventView, AuditPage, FlagView } from '~/utils/api-types';
import { describeEvent, groupByDay } from '~/utils/audit-sentence';
import { formatTime } from '~/utils/format';

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
// The viewer's own time zone decides where one day ends and the next begins.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const groups = computed(() =>
  groupByDay(events.value, new Date(), timeZone).map((group) => ({
    ...group,
    items: group.events.map((event) => ({ event, description: describeEvent(event) })),
  })),
);

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
    <h2 id="audit-title" class="text-section font-semibold">Audit log</h2>
    <p class="mt-1 text-body text-muted">
      Who changed what, newest first. Entries cannot be edited or deleted.
    </p>

    <div class="mt-4">
      <label for="audit-flag" class="block text-body font-medium">Show</label>
      <select
        id="audit-flag"
        v-model="flagFilter"
        class="mt-1 block h-8 w-full max-w-md rounded-sm border border-edge bg-surface px-2.5 text-body text-ink"
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
        <div class="space-y-6">
          <section
            v-for="group in groups"
            :key="group.key"
            :aria-labelledby="`audit-day-${group.key}`"
          >
            <h3 :id="`audit-day-${group.key}`" class="mb-1.5 text-body font-semibold text-muted">
              {{ group.label }}
            </h3>
            <ol
              class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface"
            >
              <li
                v-for="{ event, description } in group.items"
                :key="event.id"
                class="grid grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] gap-x-3 px-3 py-2.5"
              >
                <time
                  :datetime="event.createdAt"
                  class="pt-0.5 font-mono text-small whitespace-nowrap tabular-nums text-faint"
                  >{{ formatTime(event.createdAt) }}</time
                >
                <span
                  class="grid size-6 place-items-center rounded-sm border border-line bg-surface"
                  :class="description.icon === 'kill' ? 'text-danger' : 'text-muted'"
                >
                  <AppIcon :name="description.icon" />
                </span>
                <div class="min-w-0">
                  <p
                    v-for="sentence in description.sentences"
                    :key="sentence"
                    class="font-semibold wrap-anywhere"
                  >
                    {{ sentence }}
                  </p>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-3 text-small text-muted">
                    <NuxtLink
                      v-if="event.flagKey"
                      :to="`/projects/${project}/flags/${encodeURIComponent(event.flagKey)}`"
                      class="rounded-sm font-mono underline wrap-anywhere"
                    >
                      {{ event.flagKey }}
                    </NuxtLink>
                    <span class="wrap-anywhere">{{ event.actorEmail }}</span>
                  </div>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-small text-muted">
                      Raw data<span class="sr-only"> for this change</span>
                    </summary>
                    <pre class="mt-1 overflow-x-auto rounded-sm bg-subtle p-2 text-small">{{
                      JSON.stringify({ before: event.before, after: event.after }, null, 2)
                    }}</pre>
                  </details>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <div class="mt-4">
          <p
            v-if="moreError"
            role="alert"
            class="mb-2 flex items-center gap-1.5 text-body font-medium text-danger"
          >
            <AppIcon name="warning" :size="12" />
            {{ moreError }}
          </p>
          <button
            v-if="cursor"
            type="button"
            :disabled="loadingMore"
            class="h-8 rounded-sm border border-edge bg-surface px-3 font-medium text-ink hover:bg-subtle disabled:opacity-60"
            @click="loadMore"
          >
            {{ loadingMore ? 'Loading…' : 'Load more' }}
          </button>
          <p v-else-if="events.length > 0" class="text-body text-faint">That is everything.</p>
        </div>
      </ResourceState>
    </div>
  </section>
</template>
