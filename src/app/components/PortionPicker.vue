<script setup lang="ts">
/**
 * Saisie de la quantité d'un aliment, dans la mesure qui lui convient.
 *
 * L'aliment dit comment il se mesure : en grammes, en millilitres pour un
 * liquide, ou en portions nommées (« tranche », « pot », « c. à soupe »). La
 * quantité proposée d'emblée est, par ordre de préférence, la dernière saisie
 * pour cet aliment, sa première portion, puis 100 g — de sorte que le cas le
 * plus courant se résume à valider.
 *
 * Le composant n'émet que des grammes et la mesure choisie : la conversion ne
 * se fait qu'ici, et le domaine continue de ne compter qu'en grammes.
 */
import { computed, ref, watch } from 'vue'

import {
  formatPortion,
  formatWeight,
  measureOptionLabel,
  pluralize,
} from '@/app/portionFormat'
import type { RecentPortion } from '@/modules/nutrition_inventory/application'
import type { FoodItem } from '@/modules/nutrition_inventory/domain/FoodItem'
import type { Measure } from '@/modules/nutrition_inventory/domain/Measure'

const props = defineProps<{
  food: FoodItem
  recent: RecentPortion | null
}>()

const emit = defineEmits<{
  change: [portion: { readonly grams: number; readonly measure: Measure } | null]
}>()

const DEFAULT_GRAMS = 100

const measureLabel = ref<string>('')
const amount = ref<number>(0)

const base = computed(() => props.food.baseMeasure)
const measure = computed(() => props.food.measureNamed(measureLabel.value))
const grams = computed(() => amount.value * measure.value.grams)
const valid = computed(() => Number.isFinite(amount.value) && amount.value > 0)
/** Pas du bouton ± : la demi-portion, ou 10 g / 10 ml. */
const step = computed(() => (measure.value.countable ? 0.5 : 10))
const unitWord = computed(() =>
  measure.value.countable && amount.value >= 2 ? pluralize(measure.value.label) : measure.value.label,
)

/** La dernière portion, dans la mesure où elle a été saisie si la fiche la connaît encore. */
const recentPortion = computed(() => {
  if (props.recent === null) return null
  const recentMeasure = props.food.measureNamed(props.recent.measure)
  return { measure: recentMeasure, amount: roundAmount(props.recent.grams / recentMeasure.grams) }
})

const showRecent = computed(
  () =>
    recentPortion.value !== null &&
    (recentPortion.value.measure.label !== measure.value.label ||
      recentPortion.value.amount !== amount.value),
)

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100
}

function apply(next: Measure, nextAmount: number): void {
  measureLabel.value = next.label
  amount.value = nextAmount
}

function preset(): void {
  const firstServing = props.food.measures.find((candidate) => candidate.countable)
  if (recentPortion.value !== null) apply(recentPortion.value.measure, recentPortion.value.amount)
  else if (firstServing !== undefined) apply(firstServing, 1)
  else apply(base.value, DEFAULT_GRAMS / base.value.grams)
}

/**
 * Changer de mesure repart d'une portion entière ; revenir aux grammes garde
 * la quantité déjà choisie, convertie.
 */
function choose(next: Measure): void {
  if (next.label === measure.value.label) return
  const current = grams.value
  apply(next, next.countable ? 1 : Math.max(1, Math.round(current / next.grams)))
}

function stepBy(direction: 1 | -1): void {
  const next = Math.round((amount.value + direction * step.value) / step.value) * step.value
  if (next > 0) amount.value = roundAmount(next)
}

function useRecent(): void {
  if (recentPortion.value !== null) apply(recentPortion.value.measure, recentPortion.value.amount)
}

watch(() => props.food.id, preset, { immediate: true })

watch(
  [grams, measure, valid],
  () => emit('change', valid.value ? { grams: grams.value, measure: measure.value } : null),
  { immediate: true },
)
</script>

<template>
  <fieldset class="portion">
    <legend class="portion__legend">
      Quantité
    </legend>

    <button
      v-if="showRecent && recentPortion"
      type="button"
      class="portion__recent"
      @click="useRecent"
    >
      <span aria-hidden="true">↺</span>
      Comme la dernière fois : {{ formatPortion(recentPortion.amount, recentPortion.measure) }}
    </button>

    <!-- Des boutons radio natifs, sous la légende « Quantité » du fieldset :
         aucun rôle ARIA à ajouter, le groupe est déjà nommé. -->
    <div
      v-if="food.measures.length > 1"
      class="portion__measures"
    >
      <label
        v-for="option in food.measures"
        :key="option.label"
        class="portion__measure"
      >
        <input
          type="radio"
          name="portion-measure"
          :value="option.label"
          :checked="option.label === measure.label"
          @change="choose(option)"
        >
        <span>{{ measureOptionLabel(option, base) }}</span>
      </label>
    </div>

    <div class="portion__amount">
      <button
        type="button"
        class="portion__step"
        :disabled="amount <= step"
        @click="stepBy(-1)"
      >
        <span aria-hidden="true">−</span>
        <span class="sr-only">Diminuer la quantité</span>
      </button>
      <label class="portion__field">
        <span class="sr-only">Quantité en {{ measure.label }}</span>
        <input
          v-model.number="amount"
          type="number"
          inputmode="decimal"
          :min="measure.countable ? 0.25 : 1"
          :step="measure.countable ? 0.25 : 1"
        >
      </label>
      <span class="portion__unit">{{ unitWord }}</span>
      <button
        type="button"
        class="portion__step"
        @click="stepBy(1)"
      >
        <span aria-hidden="true">+</span>
        <span class="sr-only">Augmenter la quantité</span>
      </button>
    </div>

    <p
      v-if="measure.countable && valid"
      class="portion__weight"
    >
      Soit {{ formatWeight(grams, measure, base) }}
    </p>
  </fieldset>
</template>

<style scoped lang="scss">
.portion {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.portion__legend {
  margin-bottom: var(--space-2);
  padding: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.portion__recent {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px dashed var(--color-accent);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.portion__measures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.portion__measure {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  cursor: pointer;

  input {
    accent-color: var(--color-accent);
    width: 1.15rem;
    height: 1.15rem;
    flex-shrink: 0;
  }

  &:has(input:checked) {
    background: var(--color-accent-soft);
    border-color: var(--color-accent);
    font-weight: 600;
  }
}

.portion__amount {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.portion__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-lg, 1.25rem);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.portion__field input {
  width: 5.5rem;
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.portion__unit {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.portion__weight {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
