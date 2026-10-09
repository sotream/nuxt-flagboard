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
  'mt-1 block h-7 w-full rounded-sm border border-edge bg-surface px-2 text-body text-ink disabled:opacity-60';
const smallButton =
  'inline-flex h-6 items-center gap-1 rounded-sm border border-edge bg-surface px-2 text-small font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45';
</script>

<template>
  <div class="space-y-3">
    <p class="text-small text-muted">
      Rules are checked from top to bottom. The first rule whose conditions all match decides the
      answer, and the rollout is skipped. A user who lacks an attribute does not match a condition
      on it.
    </p>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <p
      v-if="forms.length === 0"
      class="rounded-md border border-dashed border-edge p-4 text-small text-muted"
    >
      No rules. Everyone is handled by the rollout above.
    </p>

    <ol class="space-y-4">
      <li v-for="(rule, ruleIndex) in forms" :key="ruleIndex">
        <fieldset :disabled="disabled" class="rounded-md border border-line bg-surface p-3">
          <legend class="px-1 text-body font-semibold">Rule {{ ruleIndex + 1 }}</legend>

          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label :for="`${id}-${ruleIndex}-serve`" class="block text-body font-medium"
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

          <p
            v-if="errors[ruleIndex]?.rule"
            class="mt-2 flex items-center gap-1.5 text-small font-medium text-danger"
          >
            <AppIcon name="warning" :size="12" />
            {{ errors[ruleIndex]?.rule }}
          </p>

          <ul class="mt-4 space-y-3">
            <li
              v-for="(condition, conditionIndex) in rule.conditions"
              :key="conditionIndex"
              class="rounded-sm bg-page p-2"
            >
              <p v-if="conditionIndex > 0" class="mb-1 text-small font-semibold text-faint">and</p>
              <div class="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_1.4fr_auto] sm:items-start">
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-attribute`"
                    class="block text-small font-medium"
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
                    :class="
                      errors[ruleIndex]?.conditions[conditionIndex]?.attribute
                        ? [field, 'border-kill ring-1 ring-kill']
                        : field
                    "
                  />
                </div>
                <div>
                  <label
                    :for="`${id}-${ruleIndex}-${conditionIndex}-operator`"
                    class="block text-small font-medium"
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
                    class="block text-small font-medium"
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
                    class="block text-small font-medium"
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
                    :class="
                      errors[ruleIndex]?.conditions[conditionIndex]?.value
                        ? [field, 'border-kill ring-1 ring-kill']
                        : field
                    "
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
                class="mt-1 text-small text-faint"
              >
                <template v-if="condition.operator === 'in'"
                  >Separate values with commas.
                </template>
                Types are strict: the text "1" does not match the number 1.
              </p>
              <p
                v-if="errors[ruleIndex]?.conditions[conditionIndex]?.attribute"
                :id="`${id}-${ruleIndex}-${conditionIndex}-attribute-error`"
                class="mt-1 flex items-center gap-1.5 text-small font-medium text-danger"
              >
                <AppIcon name="warning" :size="12" />
                {{ errors[ruleIndex]?.conditions[conditionIndex]?.attribute }}
              </p>
              <p
                v-if="errors[ruleIndex]?.conditions[conditionIndex]?.value"
                :id="`${id}-${ruleIndex}-${conditionIndex}-value-error`"
                class="mt-1 flex items-center gap-1.5 text-small font-medium text-danger"
              >
                <AppIcon name="warning" :size="12" />
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
            <AppIcon name="plus" :size="12" />
            Add condition
          </button>
        </fieldset>
      </li>
    </ol>

    <button
      v-if="!disabled"
      type="button"
      class="inline-flex h-7 items-center gap-1.5 rounded-sm border border-edge bg-surface px-3 text-body font-medium text-ink hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="forms.length >= LIMITS.rules"
      @click="addRule"
    >
      <AppIcon name="plus" />
      Add rule
    </button>
    <p v-if="forms.length >= LIMITS.rules" class="text-small text-muted">
      A flag can have at most {{ LIMITS.rules }} rules per environment.
    </p>
  </div>
</template>
