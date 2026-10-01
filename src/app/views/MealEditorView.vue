<script setup lang="ts">
/**
 * Composer, corriger ou supprimer un repas, pour n'importe quel jour.
 *
 * On compose un **brouillon** : ajouter un aliment, corriger une quantité,
 * changer le jour ou le type ne change que l'écran, dont les totaux suivent.
 * « Enregistrer le repas », en bas, écrit tout d'un coup puis ramène là d'où
 * l'on vient. Partir avant, c'est se voir demander « Quitter sans
 * enregistrer ? » — dans l'application comme en fermant l'onglet. Seul le
 * détour pour créer un aliment manquant garde le brouillon sans rien demander.
 *
 * « Mangé » et la suppression agissent sur le repas enregistré : ils attendent
 * donc qu'il n'y ait plus rien à enregistrer.
 *
 * Un repas mangé est verrouillé par le domaine. L'écran le montre tel quel, avec
 * le bouton « Mangé » pour le déverrouiller, plutôt que de laisser buter sur un
 * refus.
 *
 * On y arrive de l'accueil, de la semaine ou d'une fiche d'aliment : le
 * retour (`?retour=`) ramène là d'où l'on vient. La recherche respecte le
 * régime du profil ; ce qu'elle masque est compté, et peut être affiché.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import FoodPicker, { type FoodChoice } from '@/app/components/FoodPicker.vue'
import PlanForMembersCard from '@/app/components/PlanForMembersCard.vue'
import RecipesCard from '@/app/components/RecipesCard.vue'
import { formatDay, MEAL_OPTIONS, mealLabel } from '@/app/mealLabels'
import { usePageTitle } from '@/app/pageTitle'
import { formatPortion, measureWord } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { useBackLink } from '@/app/useBackLink'
import { parseDayKey } from '@/core/day'
import { useTodayStore } from '@/app/day/useTodayStore'
import type { FoodItemId, MealId } from '@/core/identity'
import { numberFormat, t } from '@/i18n'
import { MealType, type RecipeSummary } from '@/modules/nutrition_inventory/application'
import { stepOf } from '@/modules/nutrition_inventory/domain/Measure'
import { type DraftLine, lineCalories } from '@/modules/nutrition_inventory/presentation/mealDraft'
import { useMealEditorStore } from '@/modules/nutrition_inventory/presentation/useMealEditorStore'
import { useRecipeStore } from '@/modules/nutrition_inventory/presentation/useRecipeStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

const route = useRoute()
const router = useRouter()
const players = usePlayerStore()
const editor = useMealEditorStore()
const recipeStore = useRecipeStore()

const clock = useTodayStore()
const today = computed(() => clock.today)

const feedback = ref('')
/** Aliment à présélectionner : celui qu'on vient de créer (`?aliment=`). */
const preselect = ref<FoodItemId | null>(null)
const leaveDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const saving = ref(false)

const back = useBackLink({ to: { name: ROUTE.weekPlan }, label: t('week.title') })

const meal = computed(() => editor.meal)
const isNew = computed(() => meal.value === null)
const lines = computed(() => editor.draft.lines)
/** « Pris » n'a de sens qu'aujourd'hui et avant : le domaine refuse un jour à venir. */
const canBeConsumed = computed(() => meal.value !== null && meal.value.plannedFor <= today.value)

const heading = computed(() => (isNew.value ? t('meal.editor.newMeal') : mealLabel(editor.schedule.type)))
const title = computed(() =>
  isNew.value
    ? t('meal.editor.newMeal')
    : t('week.mealOnDay', {
        meal: mealLabel(editor.schedule.type),
        day: formatDay(editor.schedule.plannedFor),
      }),
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

/** Fermer l'onglet ou recharger avec des changements : le navigateur demande. */
function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (!editor.isDirty) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  window.addEventListener('beforeunload', warnBeforeUnload)
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
    await Promise.all([
      editor.loadRecentPortions(players.playerId, editor.schedule.plannedFor),
      recipeStore.load(players.playerId),
    ])
  }
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

/**
 * Partir avec des changements non enregistrés : on demande d'abord. Le détour
 * par la création d'un aliment garde le brouillon, et n'a rien à demander.
 */
onBeforeRouteLeave(async (to) => {
  if (!editor.isDirty || saving.value) return true
  if (to.name === ROUTE.customFood) {
    editor.keepForDetour()
    return true
  }
  const leave = (await leaveDialog.value?.ask()) ?? true
  if (leave) editor.discard()
  return leave
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
  editor.reschedule({ plannedFor, type: editor.schedule.type })
  await syncDraftQuery()
}

async function changeType(type: MealType): Promise<void> {
  editor.reschedule({ plannedFor: editor.schedule.plannedFor, type })
  await syncDraftQuery()
}

async function add(choice: FoodChoice): Promise<boolean> {
  editor.addFood(choice.food, choice.grams, choice.measure)
  feedback.value = t('meal.editor.foodAdded', {
    food: choice.food.name,
    portion: formatPortion(choice.grams / choice.measure.grams, choice.measure),
  })
  return true
}

async function addRecipe(recipe: RecipeSummary): Promise<void> {
  const result = await editor.addRecipe(recipe)
  const added = t('meal.editor.recipeAdded', { recipe: recipe.name, n: result.added })
  feedback.value =
    result.missing.length === 0
      ? added
      : t('meal.editor.recipeMissing', { added, list: result.missing.join(', ') })
}

async function saveRecipe(name: string): Promise<boolean> {
  const playerId = players.playerId
  const id = editor.mealId
  if (playerId === null || id === null) return false

  const saved = await recipeStore.saveMeal(playerId, id, name)
  feedback.value = saved === null ? '' : t('meal.editor.recipeSaved', { name: saved.name })
  return saved !== null
}

async function removeRecipe(recipe: RecipeSummary): Promise<void> {
  const playerId = players.playerId
  if (playerId === null) return
  if (await recipeStore.remove(playerId, recipe.recipeId)) {
    feedback.value = t('meal.editor.recipeRemoved', { name: recipe.name })
  }
}

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
  editor.changeGrams(line.key, value * line.measure.grams)
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
  editor.changeGrams(line.key, next * line.measure.grams)
}

function removeLine(line: DraftLine): void {
  editor.removeLine(line.key)
  feedback.value = t('meal.editor.foodRemoved', { food: line.foodName })
}

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)
const grams = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

const macros = computed(() => ({
  protein: grams(editor.totals.macros.proteinG),
  carbs: grams(editor.totals.macros.carbsG),
  fat: grams(editor.totals.macros.fatG),
}))

const canSave = computed(() => lines.value.length > 0)

/** Enregistre le brouillon, puis ramène là d'où l'on vient. */
async function save(): Promise<void> {
  const playerId = players.playerId
  if (playerId === null || !canSave.value) return
  if (!editor.isDirty) {
    await router.push(back.value.to)
    return
  }
  saving.value = true
  const saved = await editor.save(playerId)
  if (saved) await router.push(back.value.to)
  saving.value = false
}

async function remove(): Promise<void> {
  if (await editor.deleteMeal()) await router.push(back.value.to)
}
</script>

<template>
  <div class="editor">
    <header class="editor__header">
      <RouterLink
        class="editor__back"
        :to="back.to"
      >
        <AppIcon name="chevron-left" />
        <span class="sr-only">{{ t('meal.editor.backTo', { label: back.label }) }}</span>
      </RouterLink>
      <h1 class="editor__title">
        {{ heading }}
      </h1>
    </header>

    <ErrorNotice :error="editor.error" />
    <ErrorNotice :error="recipeStore.error" />

    <section
      class="editor__when"
      aria-labelledby="quand"
    >
      <h2
        id="quand"
        class="eyebrow"
      >
        {{ t('meal.editor.when') }}
      </h2>

      <label class="editor__day">
        <span class="editor__day-label">{{ t('meal.editor.day') }}</span>
        <input
          type="date"
          :value="editor.schedule.plannedFor"
          :disabled="editor.isLocked"
          @change="changeDay(($event.target as HTMLInputElement).value)"
        >
      </label>

      <fieldset class="editor__types">
        <legend class="sr-only">
          {{ t('meal.editor.meal') }}
        </legend>
        <label
          v-for="option in MEAL_OPTIONS"
          :key="option.value"
          class="editor__type"
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
      </fieldset>
    </section>

    <section
      class="editor__plate"
      aria-labelledby="assiette"
    >
      <div class="editor__plate-head">
        <h2 id="assiette">
          {{ t('meal.editor.inMeal') }}
        </h2>
        <p
          v-if="lines.length > 0"
          class="editor__count"
        >
          {{ t('meal.editor.foodCount', { n: lines.length }) }}
        </p>
      </div>

      <p
        v-if="lines.length === 0"
        class="editor__empty"
      >
        {{ t('meal.editor.emptyPlate') }}
      </p>

      <ul
        v-else
        class="editor__entries"
      >
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
            v-if="!editor.isLocked"
            class="editor__entry-controls"
          >
            <div class="stepper">
              <button
                type="button"
                class="stepper__button"
                :disabled="!canDecrease(line)"
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
              @click="removeLine(line)"
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

      <p
        v-if="editor.isLocked"
        class="editor__note"
      >
        {{ t('meal.editor.locked') }}
      </p>

      <template v-if="canBeConsumed">
        <MealConsumedToggle
          v-if="!editor.isDirty"
          :consumed-at="meal!.consumedAt"
          :meal-label="title"
          @toggle="(next) => editor.setConsumed(next)"
        />
        <p
          v-else
          class="editor__note"
        >
          {{ t('meal.editor.saveFirst') }}
        </p>
      </template>
    </section>

    <section
      v-if="!editor.isLocked"
      class="editor__add"
      aria-labelledby="ajouter"
    >
      <h2 id="ajouter">
        {{ t('meal.editor.addFood') }}
      </h2>
      <FoodPicker
        :add="add"
        :recent="editor.recentPortions"
        :preselect="preselect"
        :busy="editor.status === 'loading' || recipeStore.status === 'loading'"
        :recipes="recipeStore.recipes"
        :add-recipe="addRecipe"
        :remove-recipe="removeRecipe"
        preview
      />
    </section>

    <section
      v-if="meal"
      class="editor__options"
      aria-labelledby="autres-actions"
    >
      <h2
        id="autres-actions"
        class="sr-only"
      >
        {{ t('meal.editor.options') }}
      </h2>

      <template v-if="!editor.isDirty">
        <RecipesCard
          :busy="editor.status === 'loading' || recipeStore.status === 'loading'"
          :save="saveRecipe"
        />
        <PlanForMembersCard :meal-id="meal.mealId" />
      </template>
      <p
        v-else
        class="editor__note"
      >
        {{ t('meal.editor.saveFirst') }}
      </p>

      <ConfirmButton
        :question="t('meal.editor.deleteQuestion')"
        :confirm-label="t('meal.editor.deleteMeal')"
        @confirm="remove"
      >
        <AppIcon name="trash" />
        {{ t('meal.editor.deleteMeal') }}
      </ConfirmButton>
    </section>

    <p
      class="editor__feedback"
      role="status"
      aria-live="polite"
    >
      {{ feedback }}
    </p>

    <footer class="editor__footer">
      <div class="editor__totals">
        <p class="editor__total">
          <span class="figure editor__total-kcal">{{ kcal(editor.totals.calories) }}</span> kcal
          <span class="sr-only">— {{ t('meal.editor.total') }}</span>
        </p>
        <p class="editor__macros">
          <span aria-hidden="true">{{ t('meal.editor.macrosLine', macros) }}</span>
          <span class="sr-only">{{ t('meal.editor.macrosSpoken', macros) }}</span>
        </p>
      </div>
      <p
        v-if="editor.isDirty"
        class="editor__unsaved"
      >
        {{ t('meal.editor.unsaved') }}
      </p>
      <BaseButton
        v-if="!editor.isLocked"
        block
        :disabled="!canSave"
        :loading="saving"
        :aria-describedby="canSave ? undefined : 'raison-enregistrer'"
        @click="save"
      >
        {{ saving ? t('meal.editor.saving') : t('meal.editor.save') }}
      </BaseButton>
      <BaseButton
        v-else
        block
        variant="secondary"
        @click="router.push(back.to)"
      >
        {{ t('meal.editor.done') }}
      </BaseButton>
      <p
        v-if="!canSave && !editor.isLocked"
        id="raison-enregistrer"
        class="editor__reason"
      >
        {{ t('meal.editor.saveNeedsFood') }}
      </p>
    </footer>

    <ConfirmDialog
      ref="leaveDialog"
      :title="t('meal.editor.leave.title')"
      :message="t('meal.editor.leave.message')"
      :confirm-label="t('meal.editor.leave.confirm')"
      :cancel-label="t('meal.editor.leave.stay')"
    />
  </div>
</template>

<style scoped lang="scss">
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);

  h2 {
    margin: 0;
  }
}

.editor__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.editor__back {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-left: calc(-1 * var(--space-2));
  border-radius: 50%;
  color: var(--color-text);

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
}

.editor__title {
  margin: 0;
  overflow-wrap: break-word;
}

/* Quand : le jour, puis le type en contrôle segmenté. */
.editor__when {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.editor__day {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 3.25rem;
  padding: 0 var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);

  &:has(input:focus-visible) {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }

  input {
    min-height: 44px;
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
    text-align: right;

    &:focus-visible {
      outline: none;
    }
  }
}

.editor__day-label {
  color: var(--color-text-muted);
}

.editor__types {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-1);
  margin: 0;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-track);
}

/* Un vrai bouton radio, masqué, sous une étiquette : clavier et annonce natifs. */
.editor__type {
  position: relative;
  display: flex;

  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  span {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--space-2);
    border-radius: calc(var(--radius-md) - 4px);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  input:checked + span {
    background: var(--color-surface-raised);
    box-shadow: inset 0 0 0 1px var(--color-border-strong);
    font-weight: 700;
  }

  input:focus-visible + span {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
}

/* Dans l'assiette. */
.editor__plate,
.editor__add,
.editor__options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.editor__plate-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.editor__count,
.editor__empty,
.editor__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

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

  &:hover:not(:disabled) {
    background: var(--color-surface);
  }

  &:disabled {
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

.editor__feedback {
  min-height: 1.25rem;
  margin: 0;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

/**
 * Le pied de page reste visible au-dessus de la barre d'onglets : le total et
 * « Enregistrer » sont toujours à portée de pouce. `scroll-padding-bottom`
 * (plus bas) empêche qu'il recouvre l'élément qui a le focus — critère 2.4.11.
 */
.editor__footer {
  position: sticky;
  bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-4));
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border-top: 1px solid var(--color-border);
}

.editor__totals {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-3);

  p {
    margin: 0;
  }
}

.editor__total {
  color: var(--color-text-muted);
}

.editor__total-kcal {
  color: var(--color-text);
  font-size: var(--font-size-xl);
}

.editor__macros {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.editor__unsaved,
.editor__reason {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

:global(html:has(.editor__footer)) {
  scroll-padding-bottom: 13rem;
}

@media (min-width: 64rem) {
  .editor__footer {
    bottom: 0;
    margin-inline: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  :global(html:has(.editor__footer)) {
    scroll-padding-bottom: 9rem;
  }
}

/* Écran bas — un téléphone à l'affichage agrandi, ou tenu à l'horizontale :
   collé, le pied de page et la barre d'onglets mangeraient plus de la moitié
   de l'écran. Il reprend sa place, à la fin de l'éditeur (critère 1.4.10). */
@media (max-height: 40rem) {
  .editor__footer {
    position: static;
    margin-inline: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  :global(html:has(.editor__footer)) {
    scroll-padding-bottom: 0;
  }
}
</style>
