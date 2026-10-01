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
 *
 * Les quantités favorites de l'aliment se choisissent d'un geste, au-dessus
 * du compteur. Quand l'écran le permet (`favoriteable`), un bouton garde la
 * quantité affichée en favori, ou l'en retire : il émet `toggleFavorite`, et
 * l'écran l'enregistre et le dit.
 */
import { computed, ref, useId, watch } from 'vue'

import {
  formatPortion,
  formatWeight,
  measureOptionLabel,
  measureWord,
} from '@/app/portionFormat'
import { t } from '@/i18n'
import {
  type FavoritePortionSummary,
  MAX_FAVORITE_PORTIONS_PER_FOOD,
  type RecentPortion,
} from '@/modules/nutrition_inventory/application'
import type { FoodItem } from '@/modules/nutrition_inventory/domain/FoodItem'
import type { Measure } from '@/modules/nutrition_inventory/domain/Measure'
import AppIcon from '@/ui/AppIcon.vue'

const props = withDefaults(
  defineProps<{
    food: FoodItem
    recent: RecentPortion | null
    /** Quantités favorites de cet aliment, de la plus petite à la plus grande. */
    favorites?: readonly FavoritePortionSummary[]
    /** Montrer le bouton qui garde la quantité en favori, ou l'en retire. */
    favoriteable?: boolean
  }>(),
  { favorites: () => [], favoriteable: false },
)

const emit = defineEmits<{
  change: [portion: { readonly grams: number; readonly measure: Measure } | null]
  /** `keep` : garder la quantité en favori ; sinon, l'en retirer. */
  toggleFavorite: [portion: { readonly grams: number; readonly measure: Measure }, keep: boolean]
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
const unitWord = computed(() => measureWord(measure.value, amount.value))

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

/** Sous un pas, « − » ne ferait rien : il le dit, sans quitter l'ordre du clavier. */
const canDecrease = computed(() => amount.value > step.value)

function stepBy(direction: 1 | -1): void {
  if (direction === -1 && !canDecrease.value) return
  const next = Math.round((amount.value + direction * step.value) / step.value) * step.value
  if (next > 0) amount.value = roundAmount(next)
}

function useRecent(): void {
  if (recentPortion.value !== null) apply(recentPortion.value.measure, recentPortion.value.amount)
}

/** Les favorites, dans leur mesure si la fiche la connaît encore — comme la dernière portion. */
const favoriteChoices = computed(() =>
  props.favorites.map((favorite) => {
    const favoriteMeasure = props.food.measureNamed(favorite.measure)
    return {
      id: favorite.id,
      measure: favoriteMeasure,
      amount: roundAmount(favorite.grams / favoriteMeasure.grams),
    }
  }),
)

const isFavorite = computed(() =>
  props.favorites.some(
    (favorite) => favorite.measure === measure.value.label && Math.abs(favorite.grams - grams.value) < 0.01,
  ),
)

/** Plus de place pour une nouvelle favorite : le bouton le dit au lieu de se taire. */
const favoritesFull = computed(
  () => !isFavorite.value && props.favorites.length >= MAX_FAVORITE_PORTIONS_PER_FOOD,
)

const ids = useId()
const favoritesLabelId = `${ids}-favorites`
const favoritesFullId = `${ids}-favorites-full`

function toggleFavorite(): void {
  if (!valid.value || favoritesFull.value) return
  emit('toggleFavorite', { grams: grams.value, measure: measure.value }, !isFavorite.value)
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
      {{ t('meal.portion.legend') }}
    </legend>

    <button
      v-if="showRecent && recentPortion"
      type="button"
      class="portion__recent"
      @click="useRecent"
    >
      <span aria-hidden="true">↺</span>
      {{ t('meal.portion.sameAsLast', { portion: formatPortion(recentPortion.amount, recentPortion.measure) }) }}
    </button>

    <div
      v-if="favoriteChoices.length > 0"
      class="portion__favorites"
    >
      <p
        :id="favoritesLabelId"
        class="portion__favorites-label"
      >
        {{ t('meal.portion.favorites') }}
      </p>
      <ul
        class="portion__chips"
        :aria-labelledby="favoritesLabelId"
      >
        <li
          v-for="choice in favoriteChoices"
          :key="choice.id"
        >
          <button
            type="button"
            class="portion__chip"
            @click="apply(choice.measure, choice.amount)"
          >
            <AppIcon
              name="star-filled"
              :size="1"
            />
            {{ formatPortion(choice.amount, choice.measure) }}
          </button>
        </li>
      </ul>
    </div>

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
      <div class="portion__stepper">
        <button
          type="button"
          class="portion__step"
          :aria-disabled="canDecrease ? undefined : 'true'"
          @click="stepBy(-1)"
        >
          <AppIcon name="minus" />
          <span class="sr-only">{{ t('meal.portion.decrease') }}</span>
        </button>
        <label class="portion__field">
          <span class="sr-only">{{ t('meal.portion.quantityIn', { unit: measure.label }) }}</span>
          <input
            v-model.number="amount"
            type="number"
            inputmode="decimal"
            :min="measure.countable ? 0.25 : 1"
            :step="measure.countable ? 0.25 : 1"
          >
        </label>
        <button
          type="button"
          class="portion__step"
          @click="stepBy(1)"
        >
          <AppIcon name="plus" />
          <span class="sr-only">{{ t('meal.portion.increase') }}</span>
        </button>
      </div>
      <span class="portion__unit">{{ unitWord }}</span>
    </div>

    <p
      v-if="measure.countable && valid"
      class="portion__weight"
    >
      {{ t('meal.portion.weight', { weight: formatWeight(grams, measure, base) }) }}
    </p>

    <!-- Le nom dit ce que fait le bouton ; l'étoile pleine, sur une quantité
         déjà gardée, le redit sans compter sur la couleur. -->
    <template v-if="favoriteable && valid">
      <button
        type="button"
        class="portion__favorite"
        :aria-disabled="favoritesFull ? 'true' : undefined"
        :aria-describedby="favoritesFull ? favoritesFullId : undefined"
        @click="toggleFavorite"
      >
        <AppIcon :name="isFavorite ? 'star-filled' : 'star'" />
        {{ isFavorite ? t('meal.portion.dropFavorite') : t('meal.portion.keepFavorite') }}
      </button>
      <p
        v-if="favoritesFull"
        :id="favoritesFullId"
        class="portion__note"
      >
        {{ t('meal.portion.favoritesFull', { n: MAX_FAVORITE_PORTIONS_PER_FOOD }) }}
      </p>
    </template>
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
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  cursor: pointer;

  input {
    accent-color: var(--color-accent);
    width: 1.15rem;
    height: 1.15rem;
    flex-shrink: 0;
  }

  /* La mesure choisie : bordure Feuille épaisse **et** texte en gras. */
  &:has(input:checked) {
    padding-inline: calc(var(--space-4) - 1px);
    background: var(--color-accent-soft);
    border: 2px solid var(--color-accent);
    color: var(--color-accent-strong);
    font-weight: 700;
  }
}

/* La quantité : le compteur en pilule, puis l'unité — qui passe dessous
   plutôt que de se tasser lettre par lettre sur un écran étroit. */
.portion__amount {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.portion__stepper {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
}

.portion__step {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 50%;
  color: var(--color-text);
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
  }

  /* Inerte : un trait discontinu, et le curseur le dit. */
  &[aria-disabled='true'] {
    border: 1.5px dashed var(--color-border-strong);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.portion__field input {
  width: 4.5rem;
  min-height: 44px;
  padding: 0 var(--space-1);
  background: transparent;
  border: 0;
  border-bottom: 2px solid var(--color-border-strong);
  border-radius: 0;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  appearance: textfield;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
  }
}

.portion__unit {
  flex: 1 1 5rem;
  min-width: 0;
  overflow-wrap: break-word;
}

.portion__weight,
.portion__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.portion__favorites {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.portion__favorites-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Les favorites passent à la ligne plutôt que de déborder. */
.portion__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.portion__chip,
.portion__favorite {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
  }
}

.portion__chip {
  font-weight: 700;
}

.portion__favorite {
  align-self: flex-start;
  border-style: dashed;

  /* Inerte : le curseur le dit, et la note juste dessous dit pourquoi. */
  &[aria-disabled='true'] {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}
</style>
