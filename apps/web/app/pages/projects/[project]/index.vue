<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { navigateTo, useRoute } from '#imports';
import type { NewFlag } from '~/components/CreateFlagForm.vue';
import { useDebounced } from '~/composables/useDebounced';
import { useIsAdmin } from '~/composables/useIsAdmin';
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
      <h2 id="flags-title" class="text-xl font-semibold">Flags</h2>
      <button
        v-if="isAdmin && !creating"
        type="button"
        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        @click="creating = true"
      >
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
        <label for="flag-search" class="block text-sm font-medium">Search flags</label>
        <input
          id="flag-search"
          v-model="search"
          type="search"
          autocomplete="off"
          placeholder="Name or key"
          class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <label class="flex items-center gap-2 pb-2 text-sm">
        <input v-model="showArchived" type="checkbox" /> Show archived flags
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
            class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            @click="creating = true"
          >
            New flag
          </button>
        </template>
        <ul class="space-y-3">
          <li v-for="flag in list" :key="flag.key">
            <NuxtLink
              :to="`/projects/${projectKey}/flags/${encodeURIComponent(flag.key)}`"
              class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-medium">{{ flag.name }}</span>
                <span class="font-mono text-sm text-slate-600 dark:text-slate-400">{{
                  flag.key
                }}</span>
                <span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">{{
                  flag.type
                }}</span>
                <span
                  v-if="flag.clientVisible"
                  class="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900 dark:bg-sky-900 dark:text-sky-100"
                >
                  client-visible
                </span>
                <span
                  v-if="flag.archivedAt"
                  class="rounded bg-slate-300 px-1.5 py-0.5 text-xs text-slate-900 dark:bg-slate-600 dark:text-slate-50"
                >
                  archived
                </span>
              </span>
              <span
                v-if="flag.description"
                class="mt-1 block text-sm text-slate-600 dark:text-slate-400"
                >{{ flag.description }}</span
              >
              <span class="mt-3 flex flex-wrap gap-2">
                <EnvironmentStatus
                  v-for="environment in flag.environments"
                  :key="environment.environment"
                  :environment="environment"
                />
              </span>
            </NuxtLink>
          </li>
        </ul>
      </ResourceState>
    </div>
  </section>
</template>
