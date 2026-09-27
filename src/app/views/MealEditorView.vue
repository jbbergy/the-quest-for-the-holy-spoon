<script setup lang="ts">
/**
 * Composer, corriger ou supprimer un repas, pour n'importe quel jour.
 *
 * Deux états, une seule vue :
 * - **nouveau** (`/semaine/repas?jour=…&type=…`) : un brouillon, rien en base.
 *   Le repas naît au premier aliment ajouté, et l'adresse prend alors son
 *   identifiant — un rechargement retrouve le repas plutôt qu'un brouillon vide ;
 * - **existant** (`/semaine/repas/:mealId`) : chaque geste passe par un Use Case.
 *
 * Un repas mangé est verrouillé par le domaine. L'écran le montre tel quel, avec
 * le bouton « Mangé » pour le déverrouiller, plutôt que de laisser buter sur un
 * refus.
 *
 * On y arrive de l'accueil, de la semaine ou d'une fiche d'aliment : le
 * retour (`?retour=`) ramène là d'où l'on vient. La recherche respecte le
 * régime du profil ; ce qu'elle masque est compté, et peut être affiché.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import FoodPicker, { type FoodChoice } from '@/app/components/FoodPicker.vue'
import PlanForMembersCard from '@/app/components/PlanForMembersCard.vue'
import { formatDay, MEAL_OPTIONS, mealLabel } from '@/app/mealLabels'
import { usePageTitle } from '@/app/pageTitle'
import { formatPortion, pluralize } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { useBackLink } from '@/app/useBackLink'
import { parseDayKey } from '@/core/day'
import { useTodayStore } from '@/app/day/useTodayStore'
import type { FoodItemId, MealId } from '@/core/identity'
import { type MealEntrySummary, MealType } from '@/modules/nutrition_inventory/application'
import { useMealEditorStore } from '@/modules/nutrition_inventory/presentation/useMealEditorStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

const route = useRoute()
const router = useRouter()
const players = usePlayerStore()
const editor = useMealEditorStore()

const clock = useTodayStore()
const today = computed(() => clock.today)

const feedback = ref('')
/** Aliment à présélectionner : celui qu'on vient de créer (`?aliment=`). */
const preselect = ref<FoodItemId | null>(null)

const back = useBackLink({ to: { name: ROUTE.weekPlan }, label: 'Semaine' })

const meal = computed(() => editor.meal)
const isNew = computed(() => meal.value === null)
/** « Pris » n'a de sens qu'aujourd'hui et avant : le domaine refuse un jour à venir. */
const canBeConsumed = computed(() => meal.value !== null && editor.schedule.plannedFor <= today.value)

const title = computed(() =>
  isNew.value
    ? 'Nouveau repas'
    : `${mealLabel(editor.schedule.type)} du ${formatDay(editor.schedule.plannedFor)}`,
)
usePageTitle(title)

function isMealType(value: unknown): value is MealType {
  return Object.values(MealType).includes(value as MealType)
}

/**
 * Type proposé quand rien n'est précisé : celui que l'heure suggère. Une simple
 * valeur de départ, que la liste juste en dessous permet de changer.
 */
function mealTypeAt(date: Date): MealType {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour < 10.5) return MealType.BREAKFAST
  if (hour < 15) return MealType.LUNCH
  if (hour < 18) return MealType.SNACK
  return MealType.DINNER
}

onMounted(async () => {
  feedback.value = ''
  const id = route.params.mealId
  if (typeof id === 'string' && id !== '') {
    await editor.open(id as MealId)
  } else {
    const day = typeof route.query.jour === 'string' ? parseDayKey(route.query.jour) : null
    const type = route.query.type
    editor.startNew({
      plannedFor: day ?? today.value,
      type: isMealType(type) ? type : mealTypeAt(new Date()),
    })
  }

  // Retour de la recherche ou de la création d'un aliment : il est présélectionné.
  const requested = route.query.aliment
  if (typeof requested === 'string') preselect.value = requested as FoodItemId

  if (players.playerId !== null) {
    await editor.loadRecentPortions(players.playerId, editor.schedule.plannedFor)
  }
})

/**
 * Garde l'adresse d'un brouillon en phase avec ses choix : sans cela, un détour
 * par la création d'un aliment ramènerait au jour et au type d'origine.
 */
async function syncDraftQuery(): Promise<void> {
  if (!isNew.value) return
  await router.replace({
    name: ROUTE.mealEditor,
    query: { jour: editor.schedule.plannedFor, type: editor.schedule.type },
  })
}

async function changeDay(raw: string): Promise<void> {
  const plannedFor = parseDayKey(raw)
  if (plannedFor === null) return
  await editor.reschedule({ plannedFor, type: editor.schedule.type })
  await syncDraftQuery()
}

async function changeType(type: MealType): Promise<void> {
  await editor.reschedule({ plannedFor: editor.schedule.plannedFor, type })
  await syncDraftQuery()
}

async function add(choice: FoodChoice): Promise<boolean> {
  const playerId = players.playerId
  if (playerId === null) return false

  const wasNew = isNew.value
  const added = await editor.addFood(playerId, choice.food.id, choice.grams, choice.measure.label)
  if (!added) return false

  feedback.value = `${choice.food.name} ajouté (${formatPortion(choice.grams / choice.measure.grams, choice.measure)}).`

  // Le repas existe désormais : l'adresse le désigne, un rechargement le retrouve.
  if (wasNew && editor.mealId !== null) {
    await router.replace({ name: ROUTE.mealEditor, params: { mealId: editor.mealId } })
  }
  return true
}

/**
 * Corrige une portion, saisie dans la mesure de la ligne : « 3 » tranches,
 * converties en grammes.
 *
 * Déclenché sur `change` et non sur `input` : à chaque frappe, « 150 » passerait
 * par « 1 » puis « 15 », soit deux écritures inutiles en base. Une valeur vide
 * ou nulle est ignorée plutôt que refusée — l'usager est en train de retaper son
 * nombre, pas de saisir une erreur.
 */
async function changeAmount(entry: MealEntrySummary, raw: string): Promise<void> {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return
  await editor.changeQuantity(entry.entryId, value * entry.measure.grams)
}

/** Quantité d'une ligne dans son champ : entière en grammes, au centième en portions. */
function amountValue(entry: MealEntrySummary): number {
  return entry.measure.countable
    ? Math.round(entry.amount * 100) / 100
    : Math.round(entry.amount)
}

function entryUnit(entry: MealEntrySummary): string {
  return entry.measure.countable && entry.amount >= 2
    ? pluralize(entry.measure.label)
    : entry.measure.label
}

async function remove(): Promise<void> {
  if (await editor.deleteMeal()) await router.push(back.value.to)
}

</script>

<template>
  <div class="editor">
    <RouterLink
      class="editor__back"
      :to="back.to"
    >
      <span aria-hidden="true">←</span> {{ back.label }}
    </RouterLink>

    <h1 class="editor__title">
      {{ title }}
    </h1>

    <ErrorNotice :error="editor.error" />

    <BaseCard title="Quand ?">
      <label class="editor__date">
        <span class="editor__label">Jour</span>
        <input
          type="date"
          :value="editor.schedule.plannedFor"
          :disabled="editor.isLocked"
          @change="changeDay(($event.target as HTMLInputElement).value)"
        >
      </label>

      <fieldset class="editor__fieldset">
        <legend class="editor__label">
          Repas
        </legend>
        <div class="editor__choices">
          <label
            v-for="option in MEAL_OPTIONS"
            :key="option.value"
            class="choice"
          >
            <input
              type="radio"
              name="mealType"
              :value="option.value"
              :checked="editor.schedule.type === option.value"
              @change="changeType(option.value)"
            >
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>
    </BaseCard>

    <BaseCard
      v-if="meal"
      title="Dans ce repas"
      :subtitle="`${Math.round(meal.calories)} kcal`"
    >
      <ul class="editor__entries">
        <li
          v-for="entry in meal.entries"
          :key="entry.entryId"
          class="editor__entry"
        >
          <span class="editor__entry-name">{{ entry.foodName }}</span>

          <template v-if="!editor.isLocked">
            <label class="editor__grams">
              <span class="sr-only">Portion de {{ entry.foodName }}, en {{ entry.measure.label }}</span>
              <input
                type="number"
                inputmode="decimal"
                :min="entry.measure.countable ? 0.25 : 1"
                :step="entry.measure.countable ? 0.25 : 1"
                :value="amountValue(entry)"
                @change="changeAmount(entry, ($event.target as HTMLInputElement).value)"
              >
              <span
                class="editor__unit"
                aria-hidden="true"
              >{{ entryUnit(entry) }}</span>
            </label>

            <BaseButton
              variant="ghost"
              size="sm"
              @click="editor.removeEntry(entry.entryId)"
            >
              <span aria-hidden="true">×</span>
              <span class="sr-only">Retirer {{ entry.foodName }}</span>
            </BaseButton>
          </template>

          <span
            v-else
            class="editor__entry-grams"
          >{{ formatPortion(entry.amount, entry.measure) }}</span>
        </li>
      </ul>

      <dl class="editor__macros">
        <div>
          <dt>Protéines</dt>
          <dd>{{ meal.macros.proteinG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Glucides</dt>
          <dd>{{ meal.macros.carbsG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Lipides</dt>
          <dd>{{ meal.macros.fatG.toFixed(1) }} g</dd>
        </div>
      </dl>

      <p
        v-if="editor.isLocked"
        class="editor__note"
      >
        Ce repas est mangé. Pour le changer, décochez d’abord « Mangé ».
      </p>

      <MealConsumedToggle
        v-if="canBeConsumed"
        :consumed-at="meal.consumedAt"
        :meal-label="title"
        @toggle="(next) => editor.setConsumed(next)"
      />
    </BaseCard>

    <BaseCard
      v-if="!editor.isLocked"
      title="Ajouter un aliment"
    >
      <FoodPicker
        :add="add"
        :recent="editor.recentPortions"
        :preselect="preselect"
        :busy="editor.status === 'loading'"
        preview
      />
    </BaseCard>

    <PlanForMembersCard
      v-if="meal && meal.entries.length > 0"
      :meal-id="meal.mealId"
    />

    <p
      class="editor__feedback"
      role="status"
      aria-live="polite"
    >
      {{ feedback }}
    </p>

    <div class="editor__actions">
      <BaseButton @click="$router.push(back.to)">
        Terminé
      </BaseButton>
      <BaseButton
        v-if="meal"
        variant="danger"
        @click="remove"
      >
        Supprimer ce repas
      </BaseButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.editor__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  color: var(--color-text-muted);
  text-decoration: none;

  &:hover {
    color: var(--color-text);
  }
}

.editor__title {
  margin: 0;

  /* « Dîner du jeudi 24 septembre » peut être long : il passe à la ligne
     plutôt que d'élargir la page. */
  overflow-wrap: anywhere;
}

.editor__label {
  display: block;
  margin-bottom: var(--space-2);
  padding: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.editor__date {
  display: block;
  margin-bottom: var(--space-4);
}

.editor__date input {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
  color-scheme: light dark;

  &:disabled {
    opacity: 0.6;
  }
}

.editor__fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.editor__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.editor__entries {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.editor__entry {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.editor__entry-name {
  flex: 1;
  min-width: 0;
}

.editor__entry-grams {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.editor__grams {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.editor__unit {
  /* « c. à soupe » ou « petits-suisses » : le nom de la mesure passe à la ligne
     plutôt que d'élargir la ligne du repas. */
  max-width: 6rem;
  overflow-wrap: anywhere;
}

.editor__grams input {
  /* Assez large pour « 1000 » sans que la ligne ne se casse sur un petit écran. */
  width: 4.5rem;
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.editor__macros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.editor__macros div {
  display: flex;
  flex-direction: column;
}

.editor__macros dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.editor__macros dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.editor__note {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.editor__feedback {
  margin: 0;
  min-height: 1.5rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: center;
}

.editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
}

.choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.choice span {
  display: flex;
  flex-direction: column;
}

.choice input {
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
</style>
