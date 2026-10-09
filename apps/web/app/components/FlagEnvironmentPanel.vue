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
    class="space-y-4 py-5"
  >
    <p v-if="readOnlyReason" id="read-only-reason" class="text-body text-muted">
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
      class="flex items-start gap-2 rounded-md border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
    >
      <AppIcon name="warning" class="mt-0.5 shrink-0 text-danger" />
      <span>{{ state.error }}</span>
    </p>

    <div class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      <section
        v-if="state.server.killSwitch"
        aria-labelledby="kill-title"
        class="flex flex-wrap items-center justify-between gap-3 bg-kill-subtle px-4 py-3"
      >
        <div class="min-w-0 flex-1 basis-72">
          <h3 id="kill-title" class="flex items-center gap-2 font-semibold text-danger">
            <AppIcon name="kill" />
            Kill switch is on in {{ environment }}
          </h3>
          <p class="mt-1 text-body text-ink">
            This flag serves {{ shown(flag.offValue) }} to everyone, whatever else is set.
            <span v-if="state.server.killReason" class="wrap-anywhere"
              >Reason: {{ state.server.killReason }}</span
            >
          </p>
        </div>
        <button
          v-if="editable"
          type="button"
          :disabled="state.saving"
          class="h-7 rounded-sm border border-edge bg-surface px-3 text-body font-medium text-ink hover:bg-subtle disabled:opacity-60"
          @click="editor.releaseKillSwitch()"
        >
          Release kill switch
        </button>
      </section>

      <section aria-labelledby="enabled-title" class="space-y-2 px-4 py-3.5">
        <h3 id="enabled-title" class="sr-only">Enabled</h3>
        <ToggleSwitch
          :model-value="state.draft.enabled"
          :label="`Enabled in ${environment}`"
          :disabled="!editable || state.saving"
          :busy="state.saving"
          :describedby="readOnlyReason ? 'read-only-reason' : 'enabled-hint'"
          @update:model-value="editor.toggle($event)"
        />
        <p id="enabled-hint" class="text-small text-muted">
          When on, users who match a rule or fall inside the rollout get {{ shown(flag.onValue) }}.
          Everyone else, and everyone while it is off, gets {{ shown(flag.offValue) }}.
        </p>
      </section>

      <section aria-labelledby="rollout-title" class="space-y-2 px-4 py-3.5">
        <h3 id="rollout-title" class="font-semibold">Rollout</h3>
        <RolloutSlider
          :model-value="state.draft.rolloutPercentage"
          :disabled="!editable || state.saving"
          @update:model-value="state.draft.rolloutPercentage = $event"
        />
      </section>

      <section aria-labelledby="rules-title" class="space-y-2 px-4 py-3.5">
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

      <section
        v-if="canEdit && !state.server.killSwitch"
        aria-labelledby="danger-title"
        class="flex flex-wrap items-center justify-between gap-3 bg-kill-subtle px-4 py-3"
      >
        <div class="min-w-0 flex-1 basis-72">
          <h3 id="danger-title" class="flex items-center gap-2 font-semibold text-danger">
            <AppIcon name="kill" />
            Kill switch
          </h3>
          <p class="mt-1 text-body text-ink">
            Switches this flag off in {{ environment }} immediately. Everyone in
            {{ environment }} gets {{ shown(flag.offValue) }}, whatever else is set. Other
            environments are not affected.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-sm bg-kill px-3 text-body font-medium text-kill-fg hover:opacity-90"
          @click="
            killError = '';
            killDialogOpen = true;
          "
        >
          <AppIcon name="kill" />
          Kill switch…
        </button>
      </section>

      <p class="px-4 py-2.5 text-small text-faint">
        Last changed
        <time :datetime="state.server.updatedAt">{{ formatDateTime(state.server.updatedAt) }}</time>
        · revision
        {{ state.server.revision }}
      </p>
    </div>

    <div
      v-if="(dirty.length > 0 || rulesInvalid) && editable"
      role="region"
      aria-label="Unsaved changes"
      class="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-subtle p-3"
    >
      <p class="text-body">
        <strong>Unsaved changes:</strong>
        {{ dirty.length > 0 ? labelsOf(dirty) : 'a rule that is not complete yet' }}
        <span v-if="rulesInvalid" class="block text-danger">
          Fix the highlighted rule fields to save.
        </span>
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="state.saving || rulesInvalid"
          class="h-7 rounded-sm bg-accent px-3 text-body font-medium text-accent-fg hover:opacity-90 disabled:opacity-60"
          @click="editor.save()"
        >
          {{ state.saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button
          type="button"
          :disabled="state.saving"
          class="h-7 rounded-sm border border-edge bg-surface px-3 text-body font-medium text-ink hover:bg-subtle disabled:opacity-60"
          @click="
            editor.discard();
            rulesInvalid = false;
          "
        >
          Discard
        </button>
      </div>
    </div>

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
