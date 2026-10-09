<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useDebounced } from '~/composables/useDebounced';
import { useIsAdmin } from '~/composables/useIsAdmin';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { ProjectView } from '~/utils/api-types';
import { formatDate } from '~/utils/format';

const session = useSession();
const isAdmin = useIsAdmin();

const search = ref('');
const debouncedSearch = useDebounced(search, 250);
const projects = useResource(() =>
  session.request<ProjectView[]>('/api/v1/projects', {
    query: { search: debouncedSearch.value.trim() },
  }),
);
watch(debouncedSearch, () => void projects.reload());

const list = computed(() => projects.data.value ?? []);
const errorText = computed(() => projects.error.value?.message);
const searching = computed(() => debouncedSearch.value.trim() !== '');

const creating = ref(false);
const createPending = ref(false);
const createError = ref('');
const heading = ref<HTMLElement | null>(null);

async function create(project: { key: string; name: string }): Promise<void> {
  createPending.value = true;
  createError.value = '';
  try {
    await session.request<ProjectView>('/api/v1/projects', { method: 'POST', body: project });
    creating.value = false;
    search.value = '';
    await projects.reload();
    await nextTick();
    heading.value?.focus();
  } catch (problem) {
    createError.value =
      problem instanceof ApiError && problem.status === 409
        ? 'A project with this key already exists. Choose another key.'
        : problem instanceof ApiError
          ? problem.message
          : 'Could not create the project.';
  } finally {
    createPending.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="projects-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 id="projects-title" ref="heading" tabindex="-1" class="text-2xl font-semibold">
        Projects
      </h1>
      <button
        v-if="isAdmin && !creating"
        type="button"
        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        @click="creating = true"
      >
        New project
      </button>
    </div>

    <div v-if="creating" class="mt-4">
      <CreateProjectForm
        :pending="createPending"
        :error="createError"
        @submit="create"
        @cancel="creating = false"
      />
    </div>

    <div class="mt-4">
      <label for="project-search" class="block text-sm font-medium">Search projects</label>
      <input
        id="project-search"
        v-model="search"
        type="search"
        autocomplete="off"
        placeholder="Name or key"
        class="mt-1 block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>

    <div class="mt-4">
      <ResourceState
        label="projects"
        :status="projects.status.value"
        :has-data="projects.data.value !== undefined"
        :empty="list.length === 0"
        :error="errorText"
        :empty-title="searching ? 'No project matches your search' : 'No projects yet'"
        :empty-hint="
          searching
            ? 'Try a different name or key.'
            : isAdmin
              ? 'Create the first project to start adding flags.'
              : 'Ask an admin to create one.'
        "
        @retry="projects.reload()"
      >
        <template #empty-action>
          <button
            v-if="isAdmin && !searching"
            type="button"
            class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            @click="creating = true"
          >
            New project
          </button>
        </template>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li v-for="project in list" :key="project.id">
            <NuxtLink
              :to="`/projects/${project.key}`"
              class="block rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <span class="block font-medium">{{ project.name }}</span>
              <span class="mt-1 block font-mono text-sm text-slate-600 dark:text-slate-400">{{
                project.key
              }}</span>
              <span class="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                Created
                <time :datetime="project.createdAt">{{ formatDate(project.createdAt) }}</time>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </ResourceState>
    </div>
  </section>
</template>
