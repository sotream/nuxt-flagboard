<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EnvEditor } from '~/utils/env-editor';
import type { FlagView } from '~/utils/api-types';
import { labelsOf } from '~/utils/flag-editor';
import { formatDateTime } from '~/utils/format';
import { panelId, tabId } from '~/utils/environment-ids';

const props = defineProps<{
  editor: EnvEditor;
  flag: Pick<FlagView, 'name' | 'type' | 'onValue' | 'offValue'>;
  /** False for viewers and for archived flags. */
  canEdit: boolean;
  /** Why editing is off, shown to the person. */
  readOnlyReason?: string;
  /** Finds who made the latest change to an environment, to name them in a conflict. */
  lookupLastChange?: (environment: string) => Promise<{ email: string; at: string } | undefined>;
}>();

const state = computed(() => props.editor.state);
const environment = computed(() => state.value.server.environment);
const dirty = computed(() => props.editor.dirtyFields());
const killDialogOpen = ref(false);
const killError = ref('');
const conflictActor = ref<{ email: string; at: string } | undefined>(undefined);
// While a conflict is open nothing can be changed: any write would be based on a revision that is out of date.
const editable = computed(() => props.canEdit && !state.value.conflict);

watch(
  () => state.value.conflict?.current.revision,
  async (revision) => {
    conflictActor.value = undefined;
    if (revision === undefined) return;
    conflictActor.value = await props.lookupLastChange?.(environment.value).catch(() => undefined);
  },
  { immediate: true },
);
// True while a rule field has a problem; Save waits until it is fixed.
const rulesInvalid = ref(false);

const shown = (value: boolean | string): string =>
  typeof value === 'boolean' ? String(value) : `"${value}"`;

async function engage(reason: string): Promise<void> {
  killError.value = '';
  const done = await props.editor.engageKillSwitch(reason);
  if (done) killDialogOpen.value = false;
  else killError.value = state.value.error;
}
</script>

<template>
  <div
    :id="panelId(environment)"
    role="tabpanel"
    :aria-labelledby="tabId(environment)"
    tabindex="0"
    class="space-y-6 py-6"
  >
    <p
      v-if="readOnlyReason"
      id="read-only-reason"
      class="text-sm text-slate-600 dark:text-slate-400"
    >
      {{ readOnlyReason }}
    </p>

    <ConflictBanner
      v-if="state.conflict"
      :conflict="state.conflict"
      :draft="state.draft"
      :actor="conflictActor"
      :pending="state.saving"
      :environment="environment"
      @load-latest="editor.loadLatest()"
      @apply-mine="editor.applyMineOnLatest()"
    />

    <p
      v-if="state.error"
      role="alert"
      class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {{ state.error }}
    </p>

    <section
      v-if="state.server.killSwitch"
      aria-labelledby="kill-title"
      class="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950"
    >
      <h3 id="kill-title" class="font-semibold text-red-900 dark:text-red-100">
        Kill switch is on in {{ environment }}
      </h3>
      <p class="mt-1 text-sm text-red-800 dark:text-red-200">
        This flag serves {{ shown(flag.offValue) }} to everyone, whatever else is set.
        <span v-if="state.server.killReason">Reason: {{ state.server.killReason }}</span>
      </p>
      <button
        v-if="editable"
        type="button"
        :disabled="state.saving"
        class="mt-3 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-60 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900"
        @click="editor.releaseKillSwitch()"
      >
        Release kill switch
      </button>
    </section>

    <section aria-labelledby="enabled-title" class="space-y-2">
      <h3 id="enabled-title" class="sr-only">Enabled</h3>
      <ToggleSwitch
        :model-value="state.draft.enabled"
        :label="`Enabled in ${environment}`"
        :disabled="!editable || state.saving"
        :busy="state.saving"
        :describedby="readOnlyReason ? 'read-only-reason' : 'enabled-hint'"
        @update:model-value="editor.toggle($event)"
      />
      <p id="enabled-hint" class="text-sm text-slate-600 dark:text-slate-400">
        When on, users who match a rule or fall inside the rollout get {{ shown(flag.onValue) }}.
        Everyone else, and everyone while it is off, gets {{ shown(flag.offValue) }}.
      </p>
    </section>

    <section aria-labelledby="rollout-title" class="space-y-2">
      <h3 id="rollout-title" class="font-semibold">Rollout</h3>
      <RolloutSlider
        :model-value="state.draft.rolloutPercentage"
        :disabled="!editable || state.saving"
        @update:model-value="state.draft.rolloutPercentage = $event"
      />
    </section>

    <section aria-labelledby="rules-title" class="space-y-2">
      <h3 id="rules-title" class="font-semibold">Targeting rules</h3>
      <RuleEditor
        :model-value="state.draft.rules"
        :disabled="!editable || state.saving"
        :on-label="shown(flag.onValue)"
        :off-label="shown(flag.offValue)"
        @update:model-value="state.draft.rules = $event"
        @invalid="rulesInvalid = $event"
      />
    </section>

    <slot />

    <div
      v-if="(dirty.length > 0 || rulesInvalid) && editable"
      role="region"
      aria-label="Unsaved changes"
      class="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950"
    >
      <p class="text-sm">
        <strong>Unsaved changes:</strong>
        {{ dirty.length > 0 ? labelsOf(dirty) : 'a rule that is not complete yet' }}
        <span v-if="rulesInvalid" class="block text-red-800 dark:text-red-200">
          Fix the highlighted rule fields to save.
        </span>
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="state.saving || rulesInvalid"
          class="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          @click="editor.save()"
        >
          {{ state.saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button
          type="button"
          :disabled="state.saving"
          class="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
          @click="
            editor.discard();
            rulesInvalid = false;
          "
        >
          Discard
        </button>
      </div>
    </div>

    <section
      v-if="canEdit && !state.server.killSwitch"
      aria-labelledby="danger-title"
      class="border-t border-slate-200 pt-4 dark:border-slate-800"
    >
      <h3 id="danger-title" class="text-sm font-semibold">Emergency</h3>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Switch the flag off in {{ environment }} immediately.
      </p>
      <button
        type="button"
        class="mt-2 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950"
        @click="
          killError = '';
          killDialogOpen = true;
        "
      >
        Kill switch…
      </button>
    </section>

    <p class="text-xs text-slate-500 dark:text-slate-400">
      Last changed
      <time :datetime="state.server.updatedAt">{{ formatDateTime(state.server.updatedAt) }}</time> ·
      revision
      {{ state.server.revision }}
    </p>

    <KillSwitchDialog
      :open="killDialogOpen"
      :environment="environment"
      :flag-name="flag.name"
      :pending="state.saving"
      :error="killError"
      @confirm="engage"
      @cancel="killDialogOpen = false"
    />
  </div>
</template>
