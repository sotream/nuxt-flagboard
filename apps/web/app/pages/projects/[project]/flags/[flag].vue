<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute } from '#imports';
import { useIsAdmin } from '~/composables/useIsAdmin';
import { useProjectEvents } from '~/composables/useProjectEvents';
import type { ProjectChange } from '~/composables/useProjectEvents';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { AuditPage, EnvironmentKey, FlagEnvironmentView, FlagView } from '~/utils/api-types';
import { createEnvEditor } from '~/utils/env-editor';
import type { EnvEditor } from '~/utils/env-editor';
import { summarizeEnvironment } from '~/utils/flag-summary';

const route = useRoute();
const session = useSession();
const isAdmin = useIsAdmin();
const projectKey = computed(() => encodeURIComponent(String(route.params.project)));
const flagKey = computed(() => encodeURIComponent(String(route.params.flag)));
const flagUrl = computed(() => `/api/v1/projects/${projectKey.value}/flags/${flagKey.value}`);

const flag = useResource(() => session.request<FlagView>(flagUrl.value));
const editors = shallowRef<Partial<Record<EnvironmentKey, EnvEditor>>>({});
const selected = ref<EnvironmentKey>('dev');

function editorFor(environment: FlagEnvironmentView): EnvEditor {
  return createEnvEditor(environment, (method, suffix, body) =>
    session.request<FlagEnvironmentView>(
      `${flagUrl.value}/environments/${environment.environment}${suffix}`,
      {
        method,
        body,
      },
    ),
  );
}

// Editors are created once per environment; a later load only tells them what the server has now.
watch(
  () => flag.data.value,
  (loaded) => {
    if (!loaded) return;
    const next = { ...editors.value };
    for (const environment of loaded.environments) {
      const existing = next[environment.environment];
      if (existing) existing.receiveRemote(environment);
      else next[environment.environment] = editorFor(environment);
    }
    editors.value = next;
  },
  { immediate: true },
);

/** The newest audit event of this flag in one environment: who changed it and when. */
async function lookupLastChange(
  environment: string,
): Promise<{ email: string; at: string } | undefined> {
  const page = await session.request<AuditPage>(`/api/v1/projects/${projectKey.value}/audit`, {
    query: { flagKey: String(route.params.flag), limit: 20 },
  });
  const latest = page.items.find((event) => event.environmentKey === environment);
  return latest ? { email: latest.actorEmail, at: latest.createdAt } : undefined;
}

/** Our own save also produces an event; the editor already knows that revision, so there is nothing to reload. */
function isOwnEcho(change: ProjectChange): boolean {
  if (!change.environmentKey || change.revision === null) return false;
  const editor = editors.value[change.environmentKey as EnvironmentKey];
  return editor !== undefined && editor.state.server.revision >= change.revision;
}

const { status: liveStatus } = useProjectEvents(
  computed(() => String(route.params.project)),
  {
    onChange: (change) => {
      if (change.flagKey === String(route.params.flag) && !isOwnEcho(change)) void flag.reload();
    },
    onReconnected: () => void flag.reload(),
  },
);

const tabs = computed(() =>
  (flag.data.value?.environments ?? []).map((environment) => {
    const server = editors.value[environment.environment]?.state.server ?? environment;
    return { key: environment.environment, status: summarizeEnvironment(server).label };
  }),
);
const archived = computed(() => flag.data.value?.archivedAt != null);
const canEdit = computed(() => isAdmin.value && !archived.value);
const readOnlyReason = computed(() => {
  if (archived.value) return 'This flag is archived, so it cannot be changed. Restore it to edit.';
  return isAdmin.value ? undefined : 'You can view this flag, but only admins can change it.';
});
const settingsPending = ref(false);
const settingsError = ref('');
const archiveOpen = ref(false);

/** Changes the flag's own details (not an environment) or archives/restores it, then shows the result. */
async function updateFlag(body: object): Promise<boolean> {
  settingsPending.value = true;
  settingsError.value = '';
  try {
    await session.request<FlagView>(flagUrl.value, { method: 'PATCH', body });
    await flag.reload();
    return true;
  } catch (problem) {
    settingsError.value =
      problem instanceof ApiError ? problem.message : 'Could not save the change.';
    return false;
  } finally {
    settingsPending.value = false;
  }
}

async function archive(): Promise<void> {
  if (await updateFlag({ archived: true })) archiveOpen.value = false;
}

const selectedEditor = computed(() => editors.value[selected.value]);
</script>

<template>
  <section aria-labelledby="flag-title">
    <nav aria-label="Breadcrumb" class="text-sm text-slate-600 dark:text-slate-400">
      <NuxtLink :to="`/projects/${projectKey}`" class="hover:underline">Flags</NuxtLink>
      <span aria-hidden="true"> / </span>
      <span>{{ flag.data.value?.name ?? route.params.flag }}</span>
    </nav>

    <ResourceState
      label="flag"
      :status="flag.status.value"
      :has-data="flag.data.value !== undefined"
      :error="flag.error.value?.message"
      @retry="flag.reload()"
    >
      <div v-if="flag.data.value" class="mt-2">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 id="flag-title" class="text-xl font-semibold">{{ flag.data.value.name }}</h2>
          <p class="font-mono text-sm text-slate-600 dark:text-slate-400">
            {{ flag.data.value.key }}
          </p>
          <span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">{{
            flag.data.value.type
          }}</span>
          <span
            v-if="flag.data.value.clientVisible"
            class="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900 dark:bg-sky-900 dark:text-sky-100"
          >
            client-visible
          </span>
          <span v-if="archived" class="rounded bg-slate-300 px-1.5 py-0.5 text-xs dark:bg-slate-600"
            >archived</span
          >
          <LiveIndicator :status="liveStatus" class="ml-auto" />
        </div>
        <p v-if="flag.data.value.description" class="mt-2 text-slate-700 dark:text-slate-300">
          {{ flag.data.value.description }}
        </p>

        <FlagSettings
          v-if="isAdmin"
          class="mt-4"
          :flag="flag.data.value"
          :pending="settingsPending"
          :error="settingsError"
          @save="updateFlag"
          @archive="archiveOpen = true"
          @restore="updateFlag({ archived: false })"
        />

        <div class="mt-6">
          <EnvironmentTabs v-model="selected" :environments="tabs" />
          <FlagEnvironmentPanel
            v-if="selectedEditor"
            :key="selected"
            :editor="selectedEditor"
            :flag="flag.data.value"
            :can-edit="canEdit"
            :read-only-reason="readOnlyReason"
            :lookup-last-change="lookupLastChange"
          />
        </div>
      </div>
    </ResourceState>

    <ConfirmDialog
      :open="archiveOpen"
      :title="`Archive “${flag.data.value?.name ?? ''}”?`"
      description="SDKs will see this flag as unknown (they use their own default) and it cannot be edited until you restore it. Its key stays reserved."
      confirm-label="Archive flag"
      :pending="settingsPending"
      :error="settingsError"
      @confirm="archive"
      @cancel="archiveOpen = false"
    />
  </section>
</template>
