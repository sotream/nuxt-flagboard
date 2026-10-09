<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from '#imports';
import { useIsAdmin } from '~/composables/useIsAdmin';
import { useResource } from '~/composables/useResource';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import type { ApiKeyView, CreatedApiKey, EnvironmentKey } from '~/utils/api-types';
import { formatDate } from '~/utils/format';

const route = useRoute();
const session = useSession();
const isAdmin = useIsAdmin();
const base = computed(
  () => `/api/v1/projects/${encodeURIComponent(String(route.params.project))}/keys`,
);

const keys = useResource(() => session.request<ApiKeyView[]>(base.value));
const list = computed(() => keys.data.value ?? []);

const creating = ref(false);
const createPending = ref(false);
const createError = ref('');
/** The full key of the key just created. It lives here only until the dialog is closed. */
const revealed = ref<CreatedApiKey | null>(null);

async function create(input: {
  name: string;
  environment: EnvironmentKey;
  kind: 'server' | 'client';
}): Promise<void> {
  createPending.value = true;
  createError.value = '';
  try {
    revealed.value = await session.request<CreatedApiKey>(base.value, {
      method: 'POST',
      body: input,
    });
    creating.value = false;
    await keys.reload();
  } catch (problem) {
    createError.value = problem instanceof ApiError ? problem.message : 'Could not create the key.';
  } finally {
    createPending.value = false;
  }
}

const revoking = ref<ApiKeyView | null>(null);
const revokePending = ref(false);
const revokeError = ref('');

async function revoke(): Promise<void> {
  if (!revoking.value) return;
  revokePending.value = true;
  revokeError.value = '';
  try {
    await session.request<void>(`${base.value}/${revoking.value.id}`, { method: 'DELETE' });
    revoking.value = null;
    await keys.reload();
  } catch (problem) {
    revokeError.value = problem instanceof ApiError ? problem.message : 'Could not revoke the key.';
  } finally {
    revokePending.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="keys-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="keys-title" class="text-xl font-semibold">API keys</h2>
      <button
        v-if="isAdmin && !creating"
        type="button"
        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        @click="creating = true"
      >
        New key
      </button>
    </div>
    <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
      SDKs use these to read flags. Keys are stored hashed and shown in full only once, when they
      are created.
    </p>

    <div v-if="creating" class="mt-4">
      <CreateKeyForm
        :pending="createPending"
        :error="createError"
        @submit="create"
        @cancel="creating = false"
      />
    </div>

    <div class="mt-4">
      <ResourceState
        label="API keys"
        :status="keys.status.value"
        :has-data="keys.data.value !== undefined"
        :empty="list.length === 0"
        :error="keys.error.value?.message"
        empty-title="No API keys yet"
        :empty-hint="
          isAdmin ? 'Create a key so an SDK can read your flags.' : 'Ask an admin to create one.'
        "
        @retry="keys.reload()"
      >
        <template #empty-action>
          <button
            v-if="isAdmin"
            type="button"
            class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            @click="creating = true"
          >
            New key
          </button>
        </template>
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              API keys of this project
            </caption>
            <thead class="bg-slate-100 text-xs uppercase dark:bg-slate-800">
              <tr>
                <th scope="col" class="px-3 py-2">Name</th>
                <th scope="col" class="px-3 py-2">Kind</th>
                <th scope="col" class="px-3 py-2">Environment</th>
                <th scope="col" class="px-3 py-2">Key</th>
                <th scope="col" class="px-3 py-2">Created</th>
                <th scope="col" class="px-3 py-2">Status</th>
                <th v-if="isAdmin" scope="col" class="px-3 py-2">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody
              class="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900"
            >
              <tr v-for="key in list" :key="key.id" :class="key.revokedAt ? 'opacity-60' : ''">
                <th scope="row" class="px-3 py-2 font-medium">{{ key.name }}</th>
                <td class="px-3 py-2">
                  <span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">{{
                    key.kind
                  }}</span>
                </td>
                <td class="px-3 py-2 font-mono text-xs uppercase">{{ key.environment }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ key.prefix }}…</td>
                <td class="px-3 py-2">
                  <time :datetime="key.createdAt">{{ formatDate(key.createdAt) }}</time>
                  <span
                    v-if="key.createdByEmail"
                    class="block text-xs text-slate-500 dark:text-slate-400"
                  >
                    by {{ key.createdByEmail }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="key.revokedAt">
                    Revoked <time :datetime="key.revokedAt">{{ formatDate(key.revokedAt) }}</time>
                  </span>
                  <span v-else class="text-emerald-800 dark:text-emerald-300">Active</span>
                </td>
                <td v-if="isAdmin" class="px-3 py-2 text-right">
                  <button
                    v-if="!key.revokedAt"
                    type="button"
                    class="rounded-md border border-red-400 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950"
                    :aria-label="`Revoke ${key.name}`"
                    @click="
                      revokeError = '';
                      revoking = key;
                    "
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ResourceState>
    </div>

    <KeyRevealDialog
      :api-key="revealed?.key ?? null"
      :name="revealed?.name ?? ''"
      :kind="revealed?.kind ?? 'server'"
      :environment="revealed?.environment ?? 'dev'"
      @done="revealed = null"
    />
    <ConfirmDialog
      :open="revoking !== null"
      :title="`Revoke “${revoking?.name ?? ''}”?`"
      description="Anything using this key stops working straight away. This cannot be undone: create a new key if it was a mistake."
      confirm-label="Revoke key"
      :pending="revokePending"
      :error="revokeError"
      @confirm="revoke"
      @cancel="revoking = null"
    />
  </section>
</template>
