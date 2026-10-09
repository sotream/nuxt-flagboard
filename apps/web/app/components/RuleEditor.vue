<script setup lang="ts">
import { nextTick, ref, toRaw, useId, watch } from 'vue';
import type { Rule } from '~/utils/api-types';
import { emptyCondition, emptyRule, LIMITS, toRuleForms, toRules } from '~/utils/rule-forms';
import type { RuleErrors, RuleForm } from '~/utils/rule-forms';

const props = defineProps<{
  modelValue: Rule[];
  disabled?: boolean;
  /** What a rule serves, shown next to "on" and "off" so nobody has to remember the flag's values. */
  onLabel: string;
  offLabel: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [rules: Rule[]];
  /** True while some field has a problem, so the page can hold back Save. */
  invalid: [invalid: boolean];
}>();

const id = useId();
const forms = ref<RuleForm[]>(toRuleForms(props.modelValue));
const errors = ref<RuleErrors[]>(toRules(forms.value).errors);
const announcement = ref('');
let lastEmitted: Rule[] | undefined;
let syncing = false;

/** Rules arriving from outside (discard, load latest, a save finishing) replace the forms; our own echo does not. */
watch(
  () => props.modelValue,
  (incoming) => {
    if (toRaw(incoming) === lastEmitted) return;
    syncing = true;
    forms.value = toRuleForms(incoming);
    errors.value = toRules(forms.value).errors;
    emit('invalid', false);
    void nextTick(() => (syncing = false));
  },
);

watch(
  forms,
  () => {
    if (syncing) return;
    const read = toRules(forms.value);
    errors.value = read.errors;
    emit('invalid', !read.valid);
    if (read.valid) {
      lastEmitted = read.rules;
      emit('update:modelValue', read.rules);
    }
  },
  { deep: true },
);

const say = (message: string): void => {
  announcement.value = message;
};

async function addRule(): Promise<void> {
  forms.value.push(emptyRule());
  say(`Rule ${forms.value.length} added.`);
  await nextTick();
  document.getElementById(`${id}-${forms.value.length - 1}-0-attribute`)?.focus();
}

function removeRule(index: number): void {
  forms.value.splice(index, 1);
  say(
    `Rule ${index + 1} removed. ${forms.value.length} ${forms.value.length === 1 ? 'rule' : 'rules'} left.`,
  );
}

function moveRule(index: number, delta: -1 | 1): void {
  const target = index + delta;
  const moved = forms.value[index];
  const other = forms.value[target];
  if (!moved || !other) return;
  forms.value[index] = other;
  forms.value[target] = moved;
  say(`Rule moved to position ${target + 1} of ${forms.value.length}.`);
}

function addCondition(rule: RuleForm, index: number): void {
  rule.conditions.push(emptyCondition());
  say(`Condition ${rule.conditions.length} added to rule ${index + 1}.`);
}

function removeCondition(rule: RuleForm, ruleIndex: number, conditionIndex: number): void {
  rule.conditions.splice(conditionIndex, 1);
  say(`Condition removed from rule ${ruleIndex + 1}.`);
}

const field =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950';
const smallButton =
  'rounded-md border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-slate-600 dark:text-slate-400">
      Rules are checked from top to bottom. The first rule whose conditions all match decides the
      answer, and the rollout is skipped. A user who lacks an attribute does not match a condition
      on it.
    </p>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <p
      v-if="forms.length === 0"
      class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
    >
      No rules. Everyone is handled by the rollout above.
    </p>

    <ol class="space-y-4">
      <li v-for="(rule, ruleIndex) in forms" :key="ruleIndex">
        <fieldset
          :disabled="disabled"
          class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <legend class="px-1 text-sm font-semibold">Rule {{ ruleIndex + 1 }}</legend>

          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label :for="`${id}-${ruleIndex}-serve`" class="block text-sm font-medium"
                >When all conditions match, serve</label
              >
              <select :id="`${id}-${ruleIndex}-serve`" v-model="rule.serve" :class="field">
                <option value="on">on ({{ onLabel }})</option>
                <option value="off">off ({{ offLabel }})</option>
              </select>
            </div>
            <div v-if="!disabled" class="flex gap-2">
              <button
                type="button"
                :class="smallButton"
                :disabled="ruleIndex === 0"
                :aria-label="`Move rule ${ruleIndex + 1} up`"
                @click="moveRule(ruleIndex, -1)"
              >
                Move up
              </button>
              <button
                type="button"
                :class="smallButton"
                :disabled="ruleIndex === forms.length - 1"
                :aria-label="`Move rule ${ruleIndex + 1} down`"
                @click="moveRule(ruleIndex, 1)"
              >
                Move down
              </button>
              <button
                type="button"
                :class="smallButton"
                :aria-label="`Remove rule ${ruleIndex + 1}`"
                @click="removeRule(ruleIndex)"
              >
                Remove rule
              </button>
            </div>
          </div>

          <p v-if="errors[ruleIndex]?.rule" class="mt-2 text-sm text-red-700 dark:text-red-300">
            {{ errors[ruleIndex]?.rule }}
          </p>

          <ul class="mt-4 space-y-3">
            <li
              v-for="(condition, conditionIndex) in rule.conditions"
              :key="conditionIndex"
              class="rounded-md bg-slate-50 p-3 dark:bg-slate-950"
            >
              <p
                v-if="conditionIndex > 0"
                class="mb-2 text-xs font-semibold uppercase text-slate-500"
              >
                and
              </p>
              <div class="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1.4fr_auto] sm:items-start">
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-attribute`"
                    class="block text-xs font-medium"
                    >Attribute</label
                  >
                  <input
                    :id="`${id}-${ruleIndex}-${conditionIndex}-attribute`"
                    v-model="condition.attribute"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="country"
                    :aria-invalid="
                      errors[ruleIndex]?.conditions[conditionIndex]?.attribute ? 'true' : undefined
                    "
                    :aria-describedby="
                      errors[ruleIndex]?.conditions[conditionIndex]?.attribute
                        ? `${id}-${ruleIndex}-${conditionIndex}-attribute-error`
                        : undefined
                    "
                    :class="field"
                  />
                </div>
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-operator`"
                    class="block text-xs font-medium"
                    >Operator</label
                  >
                  <select
                    :id="`${id}-${ruleIndex}-${conditionIndex}-operator`"
                    v-model="condition.operator"
                    :class="field"
                  >
                    <option value="equals">equals</option>
                    <option value="in">is one of</option>
                  </select>
                </div>
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-type`"
                    class="block text-xs font-medium"
                    >Value type</label
                  >
                  <select
                    :id="`${id}-${ruleIndex}-${conditionIndex}-type`"
                    v-model="condition.valueType"
                    :class="field"
                  >
                    <option value="text">text</option>
                    <option value="number">number</option>
                    <option value="boolean">true / false</option>
                  </select>
                </div>
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-value`"
                    class="block text-xs font-medium"
                  >
                    {{ condition.operator === 'in' ? 'Values' : 'Value' }}
                  </label>
                  <input
                    :id="`${id}-${ruleIndex}-${conditionIndex}-value`"
                    v-model="condition.value"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="
                      condition.operator === 'in'
                        ? condition.valueType === 'boolean'
                          ? 'true, false'
                          : 'UA, PL'
                        : condition.valueType === 'boolean'
                          ? 'true'
                          : 'UA'
                    "
                    :aria-invalid="
                      errors[ruleIndex]?.conditions[conditionIndex]?.value ? 'true' : undefined
                    "
                    :aria-describedby="
                      errors[ruleIndex]?.conditions[conditionIndex]?.value
                        ? `${id}-${ruleIndex}-${conditionIndex}-value-error`
                        : `${id}-${ruleIndex}-${conditionIndex}-value-hint`
                    "
                    :class="field"
                  />
                </div>
                <div v-if="!disabled" class="sm:pt-5">
                  <button
                    type="button"
                    :class="smallButton"
                    :disabled="rule.conditions.length === 1"
                    :aria-label="`Remove condition ${conditionIndex + 1} of rule ${ruleIndex + 1}`"
                    @click="removeCondition(rule, ruleIndex, conditionIndex)"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p
                :id="`${id}-${ruleIndex}-${conditionIndex}-value-hint`"
                class="mt-1 text-xs text-slate-500 dark:text-slate-400"
              >
                <template v-if="condition.operator === 'in'"
                  >Separate values with commas.
                </template>
                Types are strict: the text "1" does not match the number 1.
              </p>
              <p
                v-if="errors[ruleIndex]?.conditions[conditionIndex]?.attribute"
                :id="`${id}-${ruleIndex}-${conditionIndex}-attribute-error`"
                class="mt-1 text-sm text-red-700 dark:text-red-300"
              >
                {{ errors[ruleIndex]?.conditions[conditionIndex]?.attribute }}
              </p>
              <p
                v-if="errors[ruleIndex]?.conditions[conditionIndex]?.value"
                :id="`${id}-${ruleIndex}-${conditionIndex}-value-error`"
                class="mt-1 text-sm text-red-700 dark:text-red-300"
              >
                {{ errors[ruleIndex]?.conditions[conditionIndex]?.value }}
              </p>
            </li>
          </ul>

          <button
            v-if="!disabled"
            type="button"
            :class="[smallButton, 'mt-3']"
            :disabled="rule.conditions.length >= LIMITS.conditionsPerRule"
            @click="addCondition(rule, ruleIndex)"
          >
            Add condition
          </button>
        </fieldset>
      </li>
    </ol>

    <button
      v-if="!disabled"
      type="button"
      class="rounded-md border border-indigo-400 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-600 dark:text-indigo-200 dark:hover:bg-indigo-950"
      :disabled="forms.length >= LIMITS.rules"
      @click="addRule"
    >
      Add rule
    </button>
    <p v-if="forms.length >= LIMITS.rules" class="text-sm text-slate-600 dark:text-slate-400">
      A flag can have at most {{ LIMITS.rules }} rules per environment.
    </p>
  </div>
</template>
