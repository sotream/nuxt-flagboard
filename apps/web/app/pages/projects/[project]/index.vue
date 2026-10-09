<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { navigateTo, useRoute } from '#imports';
import type { NewFlag } from '~/components/CreateFlagForm.vue';
import { useDebounced } from '~/composables/useDebounced';
import { useIsAdmin } from '~/composables/useIsAdmin';
import { useProjectEvents } from '~/composables/useProjectEvents';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { FlagView } from '~/utils/api-types';

const route = useRoute();
const session = useSession();
const isAdmin = useIsAdmin();
const projectKey = computed(() => encodeURIComponent(String(route.params.project)));

const search = ref('');
const debouncedSearch = useDebounced(search, 250);
const showArchived = ref(false);
const flags = useResource(() =>
  session.request<FlagView[]>(`/api/v1/projects/${projectKey.value}/flags`, {
    query: {
      search: debouncedSearch.value.trim(),
      includeArchived: showArchived.value ? true : undefined,
    },
  }),
);
watch([debouncedSearch, showArchived], () => void flags.reload());

// Changes from other people show up without a reload. Several changes in a row cause one reload.
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function reloadSoon(): void {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void flags.reload(), 300);
}
onBeforeUnmount(() => clearTimeout(reloadTimer));
const { status: liveStatus } = useProjectEvents(
  computed(() => String(route.params.project)),
  { onChange: reloadSoon, onReconnected: reloadSoon },
);

const list = computed(() => flags.data.value ?? []);
const filtering = computed(() => debouncedSearch.value.trim() !== '' || showArchived.value);

const creating = ref(false);
const createPending = ref(false);
const createError = ref('');

async function create(flag: NewFlag): Promise<void> {
  createPending.value = true;
  createError.value = '';
  try {
    await session.request<FlagView>(`/api/v1/projects/${projectKey.value}/flags`, {
      method: 'POST',
      body: flag,
    });
    await navigateTo(`/projects/${projectKey.value}/flags/${encodeURIComponent(flag.key)}`);
  } catch (problem) {
    createError.value =
      problem instanceof ApiError && problem.status === 409
        ? 'A flag with this key already exists in the project. Choose another key.'
        : problem instanceof ApiError
          ? problem.message
          : 'Could not create the flag.';
  } finally {
    createPending.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="flags-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <h2 id="flags-title" class="text-section font-semibold">Flags</h2>
        <LiveIndicator :status="liveStatus" />
      </div>
      <button
        v-if="isAdmin && !creating"
        type="button"
        class="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-3 text-body font-medium text-accent-fg hover:opacity-90"
        @click="creating = true"
      >
        <AppIcon name="plus" />
        New flag
      </button>
    </div>

    <div v-if="creating" class="mt-4">
      <CreateFlagForm
        :pending="createPending"
        :error="createError"
        @submit="create"
        @cancel="creating = false"
      />
    </div>

    <div class="mt-4 flex flex-wrap items-end gap-4">
      <div class="grow sm:max-w-md">
        <label for="flag-search" class="block text-body font-medium">Search flags</label>
        <input
          id="flag-search"
          v-model="search"
          type="search"
          autocomplete="off"
          placeholder="Name or key"
          class="mt-1 block w-full rounded-sm border border-edge bg-surface h-8 px-2.5"
        />
      </div>
      <label class="flex items-center gap-2 pb-2 text-body">
        <input v-model="showArchived" type="checkbox" class="size-4 accent-accent" /> Show archived
        flags
      </label>
    </div>

    <div class="mt-4">
      <ResourceState
        label="flags"
        :status="flags.status.value"
        :has-data="flags.data.value !== undefined"
        :empty="list.length === 0"
        :error="flags.error.value?.message"
        :empty-title="filtering ? 'No flag matches' : 'No flags yet'"
        :empty-hint="
          filtering
            ? 'Try a different search, or show archived flags.'
            : isAdmin
              ? 'Create a flag to start rolling out a feature.'
              : 'Ask an admin to create one.'
        "
        @retry="flags.reload()"
      >
        <template #empty-action>
          <button
            v-if="isAdmin && !filtering"
            type="button"
            class="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-3 text-body font-medium text-accent-fg hover:opacity-90"
            @click="creating = true"
          >
            <AppIcon name="plus" />
            New flag
          </button>
        </template>
        <ul class="divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface">
          <li v-for="flag in list" :key="flag.key">
            <NuxtLink
              :to="`/projects/${projectKey}/flags/${encodeURIComponent(flag.key)}`"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 hover:bg-subtle focus-visible:-outline-offset-2"
            >
              <span class="min-w-0 flex-1 basis-60">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="font-semibold wrap-anywhere">{{ flag.name }}</span>
                  <AppIcon
                    v-if="flag.clientVisible"
                    name="eye"
                    :size="14"
                    label="Visible to client keys"
                    class="text-muted"
                  />
                  <span
                    v-if="flag.type !== 'boolean'"
                    class="rounded-sm border border-line px-1.5 text-small text-muted"
                    >{{ flag.type }}</span
                  >
                  <span
                    v-if="flag.archivedAt"
                    class="rounded-sm bg-subtle px-1.5 text-small text-muted"
                  >
                    archived
                  </span>
                </span>
                <span class="block font-mono text-small text-muted wrap-anywhere">{{
                  flag.key
                }}</span>
                <span
                  v-if="flag.description"
                  class="mt-0.5 block text-small text-muted wrap-anywhere"
                  >{{ flag.description }}</span
                >
              </span>
              <span class="flex flex-wrap gap-3">
                <EnvironmentStatus
                  v-for="environment in flag.environments"
                  :key="environment.environment"
                  :environment="environment"
                />
              </span>
              <AppIcon name="chevron" class="hidden shrink-0 text-faint sm:block" />
            </NuxtLink>
          </li>
        </ul>
      </ResourceState>
    </div>
  </section>
</template>
