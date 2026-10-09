<script setup lang="ts">
import { computed, provide, watch } from 'vue';
import { useRoute } from '#imports';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import type { ProjectView } from '~/utils/api-types';
import { PROJECT_CONTEXT } from '~/utils/project-context';

const route = useRoute();
const session = useSession();
const projectKey = computed(() => String(route.params.project));

const project = useResource(() =>
  session.request<ProjectView>(`/api/v1/projects/${encodeURIComponent(projectKey.value)}`),
);
watch(projectKey, () => void project.reload());
provide(PROJECT_CONTEXT, project);

const base = computed(() => `/projects/${encodeURIComponent(projectKey.value)}`);
const sections = computed(() => [
  { label: 'Flags', to: base.value },
  { label: 'API keys', to: `${base.value}/keys` },
  { label: 'Audit log', to: `${base.value}/audit` },
]);
</script>

<template>
  <section>
    <nav aria-label="Breadcrumb" class="text-sm text-slate-600 dark:text-slate-400">
      <NuxtLink to="/" class="hover:underline">Projects</NuxtLink>
      <span aria-hidden="true"> / </span>
      <span>{{ project.data.value?.name ?? projectKey }}</span>
    </nav>

    <ResourceState
      label="project"
      :status="project.status.value"
      :has-data="project.data.value !== undefined"
      :error="project.error.value?.message"
      @retry="project.reload()"
    >
      <div class="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 class="text-2xl font-semibold">{{ project.data.value?.name }}</h1>
        <p class="font-mono text-sm text-slate-600 dark:text-slate-400">
          {{ project.data.value?.key }}
        </p>
      </div>

      <nav
        aria-label="Project sections"
        class="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-800"
      >
        <NuxtLink
          v-for="section in sections"
          :key="section.to"
          :to="section.to"
          exact-active-class="border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
          class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          {{ section.label }}
        </NuxtLink>
      </nav>

      <div class="mt-6">
        <NuxtPage />
      </div>
    </ResourceState>
  </section>
</template>
