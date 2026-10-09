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
  { label: 'Flags', to: base.value, icon: 'flag' as const },
  { label: 'API keys', to: `${base.value}/keys`, icon: 'key' as const },
  { label: 'Audit log', to: `${base.value}/audit`, icon: 'audit' as const },
]);
</script>

<template>
  <section>
    <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-small text-muted">
      <NuxtLink to="/" class="rounded-sm hover:text-ink hover:underline">Projects</NuxtLink>
      <AppIcon name="chevron" :size="12" />
      <span class="min-w-0 wrap-anywhere">{{ project.data.value?.name ?? projectKey }}</span>
    </nav>

    <ResourceState
      label="project"
      :status="project.status.value"
      :has-data="project.data.value !== undefined"
      :error="project.error.value?.message"
      @retry="project.reload()"
    >
      <div class="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 class="text-title wrap-anywhere">{{ project.data.value?.name }}</h1>
        <p class="font-mono text-small text-muted">
          {{ project.data.value?.key }}
        </p>
      </div>

      <nav aria-label="Project sections" class="mt-4 flex gap-1 border-b border-line">
        <NuxtLink
          v-for="section in sections"
          :key="section.to"
          :to="section.to"
          exact-active-class="border-accent text-ink"
          class="-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 pb-2 pt-1 text-body font-medium text-muted hover:text-ink"
        >
          <AppIcon :name="section.icon" />
          {{ section.label }}
        </NuxtLink>
      </nav>

      <div class="mt-6">
        <NuxtPage />
      </div>
    </ResourceState>
  </section>
</template>
