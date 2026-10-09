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
      <h2 id="keys-title" class="text-section font-semibold">API keys</h2>
      <button
        v-if="isAdmin && !creating"
        type="button"
        class="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-3 text-body font-medium text-accent-fg hover:opacity-90"
        @click="creating = true"
      >
        <AppIcon name="plus" />
        New key
      </button>
    </div>
    <p class="mt-1 text-small text-muted">
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
            class="inline-flex h-7 items-center gap-1.5 rounded-sm bg-accent px-3 text-body font-medium text-accent-fg hover:opacity-90"
            @click="creating = true"
          >
            <AppIcon name="plus" />
            New key
          </button>
        </template>
        <div class="overflow-x-auto rounded-sm border border-line">
          <table class="w-full text-left text-body">
            <caption class="sr-only">
              API keys of this project
            </caption>
            <thead class="bg-subtle text-small text-muted">
              <tr>
                <th scope="col" class="px-3 py-2 font-medium">Name</th>
                <th scope="col" class="px-3 py-2 font-medium">Kind</th>
                <th scope="col" class="px-3 py-2 font-medium">Environment</th>
                <th scope="col" class="px-3 py-2 font-medium">Key</th>
                <th scope="col" class="px-3 py-2 font-medium">Created</th>
                <th scope="col" class="px-3 py-2 font-medium">Status</th>
                <th v-if="isAdmin" scope="col" class="px-3 py-2">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line bg-surface">
              <tr v-for="key in list" :key="key.id" :class="key.revokedAt ? 'text-muted' : ''">
                <th scope="row" class="px-3 py-2 font-medium">{{ key.name }}</th>
                <td class="px-3 py-2">
                  <span class="rounded-sm border border-line px-1.5 text-small">{{
                    key.kind
                  }}</span>
                </td>
                <td class="px-3 py-2 font-mono text-small">{{ key.environment }}</td>
                <td class="px-3 py-2 font-mono text-small">{{ key.prefix }}…</td>
                <td class="px-3 py-2">
                  <time :datetime="key.createdAt">{{ formatDate(key.createdAt) }}</time>
                  <span v-if="key.createdByEmail" class="block text-small text-faint">
                    by {{ key.createdByEmail }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <span v-if="key.revokedAt">
                    Revoked <time :datetime="key.revokedAt">{{ formatDate(key.revokedAt) }}</time>
                  </span>
                  <span v-else class="text-on">Active</span>
                </td>
                <td v-if="isAdmin" class="px-3 py-2 text-right">
                  <button
                    v-if="!key.revokedAt"
                    type="button"
                    class="h-6 rounded-sm border border-kill/50 px-2.5 text-small font-medium text-danger hover:bg-kill-subtle"
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
