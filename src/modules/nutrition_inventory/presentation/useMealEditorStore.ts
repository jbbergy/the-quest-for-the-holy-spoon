import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import { type DayKey, dayKeyOf } from '@/core/day'
import type { FoodItemId, MealId, PlayerId } from '@/core/identity'

import { type MealSchedule, type MealSummary, MealType, type RecentPortion, type RecipeSummary } from '../application'
import type { FoodItem } from '../domain/FoodItem'
import type { Measure } from '../domain/Measure'

import {
  draftFromMeal,
  draftTotals,
  emptyDraft,
  isDirty,
  lineFor,
  linesToSave,
  type MealDraft,
  withGrams,
  withLine,
  withoutLine,
  withSchedule,
} from './mealDraft'
import type { StoreStatus } from './useJournalStore'

/**
 * Adaptateur d'état du repas en cours de composition.
 *
 * On compose un **brouillon** : ajouter un aliment, corriger une quantité,
 * changer le jour ne font que le modifier, et l'écran recalcule les totaux.
 * « Enregistrer le repas » l'écrit d'un coup (`SaveMealDraftUseCase`) ; tant
 * que ce n'est pas fait, `isDirty` le dit, et l'écran retient la personne qui
 * s'en va.
 *
 * « Mangé » et la suppression agissent sur le repas **enregistré** : ce sont
 * des décisions sur un repas, pas des gestes de composition.
 */
export const useMealEditorStore = defineStore('mealEditor', () => {
  /** Le repas tel qu'il est enregistré ; `null` tant qu'il n'existe pas. */
  const meal = shallowRef<MealSummary | null>(null)
  const draft = shallowRef<MealDraft>(
    emptyDraft({ plannedFor: dayKeyOf(new Date()), type: MealType.LUNCH }),
  )
  const status = ref<StoreStatus>('idle')
  const error = ref<ErrorView | null>(null)
  /** Dernière portion saisie pour chaque aliment, pour préremplir la quantité. */
  const recentPortions = shallowRef<ReadonlyMap<FoodItemId, RecentPortion>>(new Map())

  /**
   * Brouillon mis de côté pendant un détour (créer un aliment manquant) : il
   * est repris au retour, au lieu d'être remplacé par le repas enregistré.
   */
  let kept: { readonly mealId: MealId | null } | null = null

  const mealId = computed<MealId | null>(() => meal.value?.mealId ?? null)
  const schedule = computed<MealSchedule>(() => draft.value.schedule)
  /** Un repas pris est verrouillé par le domaine : l'écran le dit avant qu'on bute dessus. */
  const isLocked = computed(() => meal.value?.consumedAt != null)
  const isDirtyDraft = computed(() => isDirty(draft.value, meal.value))
  const totals = computed(() => draftTotals(draft.value))

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    return false
  }

  function ready(): void {
    error.value = null
    status.value = 'ready'
  }

  /** Reprend le brouillon mis de côté, s'il appartient à ce repas. */
  function resumeKept(id: MealId | null): boolean {
    const resumable = kept !== null && kept.mealId === id
    kept = null
    return resumable
  }

  /** Met le brouillon de côté pour un détour : il sera repris au retour. */
  function keepForDetour(): void {
    kept = { mealId: mealId.value }
  }

  /** Commence un repas qui n'existe pas encore. */
  function startNew(next: MealSchedule): void {
    if (resumeKept(null) && meal.value === null) {
      ready()
      return
    }
    meal.value = null
    draft.value = emptyDraft(next)
    ready()
  }

  async function open(id: MealId): Promise<boolean> {
    const resume = resumeKept(id) && meal.value?.mealId === id
    status.value = 'loading'
    const result = await useContainer().inventory.getMeal.execute(id)
    if (!result.ok) return fail(result.error)

    meal.value = result.value
    if (!resume) draft.value = draftFromMeal(result.value)
    ready()
    return true
  }

  /**
   * Charge les dernières portions du joueur. Un échec n'est pas une erreur de
   * l'écran : sans suggestion, la quantité se saisit comme avant.
   */
  async function loadRecentPortions(playerId: PlayerId, around: DayKey): Promise<void> {
    const result = await useContainer().inventory.recentPortions.execute(playerId, around)
    if (result.ok) recentPortions.value = result.value
  }

  /** Ajoute un aliment au brouillon ; la portion devient la suggestion suivante. */
  function addFood(food: FoodItem, grams: number, measure: Measure): void {
    draft.value = withLine(draft.value, lineFor(food, grams, measure))
    const next = new Map(recentPortions.value)
    next.set(food.id, { grams, measure: measure.label })
    recentPortions.value = next
  }

  /**
   * Ajoute les ingrédients d'une recette au brouillon. Les fiches sont relues
   * pour calculer les calories ; celles qui ont disparu du catalogue sont
   * nommées plutôt que perdues en silence.
   */
  async function addRecipe(
    recipe: RecipeSummary,
  ): Promise<{ readonly added: number; readonly missing: readonly string[] }> {
    const missing: string[] = []
    let added = 0
    let next = draft.value
    for (const line of recipe.lines) {
      const food = await useContainer().inventory.getFood.execute(line.foodItemId)
      if (!food.ok || food.value === null) {
        missing.push(line.foodName)
        continue
      }
      next = withLine(next, lineFor(food.value, line.grams, line.measure))
      added += 1
    }
    draft.value = next
    return { added, missing }
  }

  function changeGrams(key: string, grams: number): void {
    draft.value = withGrams(draft.value, key, grams)
  }

  function removeLine(key: string): void {
    draft.value = withoutLine(draft.value, key)
  }

  function reschedule(next: MealSchedule): void {
    draft.value = withSchedule(draft.value, next)
  }

  /** Oublie les changements : le brouillon redevient le repas enregistré. */
  function discard(): void {
    draft.value = meal.value === null ? emptyDraft(draft.value.schedule) : draftFromMeal(meal.value)
  }

  /** Enregistre le brouillon d'un coup, puis relit le repas enregistré. */
  async function save(playerId: PlayerId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().inventory.saveDraft.execute({
      playerId,
      ...(mealId.value === null ? {} : { mealId: mealId.value }),
      schedule: draft.value.schedule,
      lines: linesToSave(draft.value),
    })
    if (!result.ok) return fail(result.error)
    return open(result.value.id)
  }

  async function setConsumed(consumed: boolean): Promise<boolean> {
    const id = mealId.value
    if (id === null) return false

    status.value = 'loading'
    const result = await useContainer().inventory.markConsumed.execute(id, consumed)
    return result.ok ? open(id) : fail(result.error)
  }

  async function deleteMeal(): Promise<boolean> {
    const id = mealId.value
    if (id === null) return true

    status.value = 'loading'
    const result = await useContainer().inventory.deleteMeal.execute(id)
    if (!result.ok) return fail(result.error)

    meal.value = null
    draft.value = emptyDraft(draft.value.schedule)
    ready()
    return true
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = 'ready'
  }

  return {
    meal,
    draft,
    schedule,
    status,
    error,
    mealId,
    isLocked,
    isDirty: isDirtyDraft,
    totals,
    recentPortions,
    loadRecentPortions,
    startNew,
    open,
    addFood,
    addRecipe,
    changeGrams,
    removeLine,
    reschedule,
    discard,
    save,
    setConsumed,
    deleteMeal,
    keepForDetour,
    clearError,
  }
})
