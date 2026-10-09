<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { summarizeConflict } from '~/utils/conflict-summary';
import type { Conflict } from '~/utils/env-editor';
import type { Draft } from '~/utils/flag-editor';
import { formatDateTime } from '~/utils/format';

const props = defineProps<{
  conflict: Conflict;
  /** What the person has in the form right now. */
  draft: Draft;
  /** Who made the other change and when, if known. Falls back to the time on the new state. */
  actor?: { email: string; at: string };
  /** True while an action is running. */
  pending?: boolean;
  /** Which environment, for the heading. */
  environment: string;
}>();
defineEmits<{ 'load-latest': []; 'apply-mine': [] }>();

const summary = computed(() => summarizeConflict(props.conflict, props.draft));
const hasMine = computed(() => summary.value.mine.length > 0);
const who = computed(() => props.actor?.email ?? 'Someone');
const when = computed(() => props.actor?.at ?? props.conflict.current.updatedAt);

const heading = ref<HTMLElement | null>(null);
// The banner appears while the person is working: move focus to it so keyboard and screen reader users notice.
onMounted(() => void nextTick(() => heading.value?.focus()));
</script>

<template>
  <section
    role="alert"
    aria-labelledby="conflict-title"
    class="space-y-3 rounded-lg border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
  >
    <h3
      id="conflict-title"
      ref="heading"
      tabindex="-1"
      class="font-semibold text-amber-950 dark:text-amber-100"
    >
      {{ environment }} was changed while you were working
    </h3>
    <p class="text-sm text-amber-950 dark:text-amber-100">
      {{ who }} made a change at <time :datetime="when">{{ formatDateTime(when) }}</time
      >. Nothing you typed has been lost, and nothing has been overwritten.
    </p>

    <dl class="space-y-1 text-sm text-amber-950 dark:text-amber-100">
      <div v-if="summary.theirs.length > 0" class="flex flex-wrap gap-x-2">
        <dt class="font-medium">Changed by them:</dt>
        <dd>{{ summary.theirs.join(', ') }}</dd>
      </div>
      <div v-if="hasMine" class="flex flex-wrap gap-x-2">
        <dt class="font-medium">Your unsaved changes:</dt>
        <dd>{{ summary.mine.join(', ') }}</dd>
      </div>
    </dl>
    <p v-if="summary.both.length > 0" class="text-sm font-medium text-red-900 dark:text-red-200">
      You both changed {{ summary.both.join(', ') }}. If you apply your changes, yours replace
      theirs there.
    </p>

    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        :disabled="pending"
        class="rounded-md border border-amber-500 bg-white px-3 py-1.5 text-sm font-medium hover:bg-amber-100 disabled:opacity-60 dark:bg-amber-900 dark:hover:bg-amber-800"
        @click="$emit('load-latest')"
      >
        Load latest
        <span class="sr-only">and discard my changes</span>
      </button>
      <button
        v-if="hasMine"
        type="button"
        :disabled="pending"
        class="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
        @click="$emit('apply-mine')"
      >
        Apply my changes on latest
      </button>
    </div>
    <p class="text-xs text-amber-900 dark:text-amber-200">
      “Load latest” shows the current state and drops your changes. “Apply my changes on latest”
      keeps them on top of the current state so you can review them and save again.
    </p>
  </section>
</template>
