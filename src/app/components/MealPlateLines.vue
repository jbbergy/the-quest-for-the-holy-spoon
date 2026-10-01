<script setup lang="ts">
/**
 * Les aliments d'un repas en cours de composition : chacun avec ses calories,
 * sa provenance et, tant que le repas n'est pas mangé, un compteur − / + et un
 * bouton pour le retirer.
 *
 * La quantité se saisit dans la mesure de la ligne — « 3 » tranches — et
 * remonte en grammes : c'est l'éditeur qui décide quoi en faire.
 */
import { formatPortion, measureWord } from '@/app/portionFormat'
import { numberFormat, t } from '@/i18n'
import { stepOf } from '@/modules/nutrition_inventory/domain/Measure'
import { type DraftLine, lineCalories } from '@/modules/nutrition_inventory/presentation/mealDraft'
import AppIcon from '@/ui/AppIcon.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'

defineProps<{
  lines: readonly DraftLine[]
  /** Repas mangé : les quantités se lisent, sans se modifier. */
  locked: boolean
}>()

const emit = defineEmits<{
  changeGrams: [key: DraftLine['key'], grams: number]
  remove: [line: DraftLine]
}>()

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

/** Quantité d'une ligne dans sa mesure : entière en grammes, au centième en portions. */
function amountOf(line: DraftLine): number {
  const amount = line.grams / line.measure.grams
  return line.measure.countable ? Math.round(amount * 100) / 100 : Math.round(amount)
}

function unitOf(line: DraftLine): string {
  return measureWord(line.measure, line.grams / line.measure.grams)
}

/**
 * Corrige une quantité saisie dans la mesure de la ligne : « 3 » tranches,
 * converties en grammes. Sur `change`, pas à chaque frappe ; une valeur vide
 * ou nulle est ignorée — la personne est en train de retaper son nombre.
 */
function typeAmount(line: DraftLine, raw: string): void {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return
  emit('changeGrams', line.key, value * line.measure.grams)
}

/** On descend d'un pas tant qu'il reste au moins un pas : jamais à zéro. */
function canDecrease(line: DraftLine): boolean {
  const size = stepOf(line.measure)
  return amountOf(line) - size >= size
}

/** Un pas de plus ou de moins : la demi-portion, ou 5 g. */
function step(line: DraftLine, direction: 1 | -1): void {
  if (direction === -1 && !canDecrease(line)) return
  const next = amountOf(line) + direction * stepOf(line.measure)
  emit('changeGrams', line.key, next * line.measure.grams)
}
</script>

<template>
  <ul class="editor__entries">
    <li
      v-for="line in lines"
      :key="line.key"
      class="editor__entry"
    >
      <div class="editor__entry-head">
        <span class="editor__entry-name">{{ line.foodName }}</span>
        <span class="editor__entry-kcal">{{ kcal(lineCalories(line)) }} kcal</span>
      </div>
      <FoodSourceTag
        v-if="line.source"
        :source="line.source"
      />

      <div
        v-if="!locked"
        class="editor__entry-controls"
      >
        <div class="stepper">
          <button
            type="button"
            class="stepper__button"
            :aria-disabled="canDecrease(line) ? undefined : 'true'"
            @click="step(line, -1)"
          >
            <AppIcon name="minus" />
            <span class="sr-only">{{ t('meal.portion.decrease') }} : {{ line.foodName }}</span>
          </button>
          <label class="stepper__field">
            <span class="sr-only">{{ t('meal.editor.portionOf', { food: line.foodName, unit: line.measure.label }) }}</span>
            <input
              type="number"
              inputmode="decimal"
              :min="line.measure.countable ? 0.25 : 1"
              :step="line.measure.countable ? 0.25 : 1"
              :value="amountOf(line)"
              @change="typeAmount(line, ($event.target as HTMLInputElement).value)"
            >
            <span
              class="stepper__unit"
              aria-hidden="true"
            >{{ unitOf(line) }}</span>
          </label>
          <button
            type="button"
            class="stepper__button"
            @click="step(line, 1)"
          >
            <AppIcon name="plus" />
            <span class="sr-only">{{ t('meal.portion.increase') }} : {{ line.foodName }}</span>
          </button>
        </div>

        <button
          type="button"
          class="editor__remove"
          @click="emit('remove', line)"
        >
          <AppIcon name="close" />
          <span class="sr-only">{{ t('meal.editor.remove', { food: line.foodName }) }}</span>
        </button>
      </div>

      <span
        v-else
        class="editor__entry-amount"
      >{{ formatPortion(line.grams / line.measure.grams, line.measure) }}</span>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.editor__entries {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.editor__entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-4);

  & + & {
    border-top: 1px solid var(--color-divider);
  }
}

.editor__entry-head {
  display: flex;
  align-self: stretch;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.editor__entry-name {
  font-weight: 700;
  overflow-wrap: break-word;
}

.editor__entry-kcal {
  flex-shrink: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.editor__entry-amount {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.editor__entry-controls {
  display: flex;
  align-self: stretch;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

/* − quantité + : les boutons ronds de 44 px encadrent le champ. */
.stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
}

.stepper__button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;

  &:hover:not([aria-disabled='true']) {
    background: var(--color-surface);
  }

  /* `aria-disabled` plutôt que `disabled`, comme `BaseButton` : au plus petit
     pas, « − » reste dans l'ordre de tabulation et s'annonce indisponible, au
     lieu de disparaître sous le focus. `step()` ignore alors le clic. */
  &[aria-disabled='true'] {
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.stepper__field {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);

  input {
    width: 3.5rem;
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
    text-align: right;
  }
}

.stepper__unit {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.editor__remove {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    background: var(--color-danger-soft);
    color: var(--color-danger-strong);
  }
}
</style>
