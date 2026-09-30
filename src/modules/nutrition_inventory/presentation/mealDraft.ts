import { Macros, type MacrosProps } from '@/core/nutrition/Macros'
import type { FoodItemId, MealEntryId } from '@/core/identity'

import type { MealDraftLine, MealSchedule, MealSummary } from '../application'
import type { FoodItem } from '../domain/FoodItem'
import type { Measure } from '../domain/Measure'

/**
 * Le repas tel qu'on le compose à l'écran, avant « Enregistrer le repas ».
 *
 * Rien n'est écrit tant qu'on compose : ajouter, corriger ou retirer un
 * aliment ne change que ce brouillon. Chaque ligne garde ses macros pour
 * 100 g, ce qui suffit à recalculer à l'écran les calories d'une quantité
 * corrigée, sans relire la fiche ni rien enregistrer.
 *
 * Fonctions pures : un brouillon se remplace, il ne se modifie pas.
 */
export interface DraftLine {
  /** Clé d'affichage, stable pendant la composition. */
  readonly key: string
  /** Ligne déjà enregistrée ; `null` pour un aliment ajouté dans le brouillon. */
  readonly entryId: MealEntryId | null
  readonly foodItemId: FoodItemId
  readonly foodName: string
  /** Provenance de la fiche, pour l'étiquette ; inconnue pour une ligne déjà enregistrée. */
  readonly source: string | null
  readonly grams: number
  readonly measure: Measure
  readonly macrosPer100g: MacrosProps
}

export interface MealDraft {
  readonly schedule: MealSchedule
  readonly lines: readonly DraftLine[]
}

let nextKey = 0
const newKey = (): string => `ligne-${++nextKey}`

const scaled = (macros: MacrosProps, factor: number): MacrosProps => ({
  proteinG: macros.proteinG * factor,
  carbsG: macros.carbsG * factor,
  fatG: macros.fatG * factor,
})

/** Le brouillon d'un repas enregistré : ses lignes telles quelles. */
export function draftFromMeal(meal: MealSummary): MealDraft {
  return {
    schedule: { plannedFor: meal.plannedFor, type: meal.type },
    lines: meal.entries.map((entry) => ({
      key: entry.entryId,
      entryId: entry.entryId,
      foodItemId: entry.foodItemId,
      foodName: entry.foodName,
      source: null,
      grams: entry.grams,
      measure: entry.measure,
      macrosPer100g: entry.grams > 0 ? scaled(entry.macros, 100 / entry.grams) : scaled(entry.macros, 0),
    })),
  }
}

export function emptyDraft(schedule: MealSchedule): MealDraft {
  return { schedule: { ...schedule }, lines: [] }
}

/** Une ligne pour un aliment choisi dans la recherche ou une recette. */
export function lineFor(food: FoodItem, grams: number, measure: Measure): DraftLine {
  return {
    key: newKey(),
    entryId: null,
    foodItemId: food.id,
    foodName: food.name,
    source: food.source,
    grams,
    measure,
    macrosPer100g: food.macrosPer100g.toJSON(),
  }
}

export function withLine(draft: MealDraft, line: DraftLine): MealDraft {
  return { ...draft, lines: [...draft.lines, line] }
}

export function withoutLine(draft: MealDraft, key: string): MealDraft {
  return { ...draft, lines: draft.lines.filter((line) => line.key !== key) }
}

/** Nouvelle quantité d'une ligne, en grammes ; une quantité nulle ou négative est ignorée. */
export function withGrams(draft: MealDraft, key: string, grams: number): MealDraft {
  if (!Number.isFinite(grams) || grams <= 0) return draft
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.key === key ? { ...line, grams } : line)),
  }
}

export function withSchedule(draft: MealDraft, schedule: MealSchedule): MealDraft {
  return { ...draft, schedule: { ...schedule } }
}

export function lineMacros(line: DraftLine): MacrosProps {
  return scaled(line.macrosPer100g, line.grams / 100)
}

export function lineCalories(line: DraftLine): number {
  return Macros.reconstitute(lineMacros(line)).calories()
}

/** Calories et macros du repas composé, recalculées à chaque geste. */
export function draftTotals(draft: MealDraft): { readonly calories: number; readonly macros: MacrosProps } {
  const macros = draft.lines.reduce(
    (sum, line) => {
      const own = lineMacros(line)
      return {
        proteinG: sum.proteinG + own.proteinG,
        carbsG: sum.carbsG + own.carbsG,
        fatG: sum.fatG + own.fatG,
      }
    },
    { proteinG: 0, carbsG: 0, fatG: 0 },
  )
  return { calories: Macros.reconstitute(macros).calories(), macros }
}

/**
 * Le brouillon diffère-t-il de ce qui est enregistré ?
 *
 * Pour un repas qui n'existe pas encore, seul l'ajout d'un aliment compte :
 * avoir choisi « Dîner » sans rien y mettre ne mérite pas qu'on retienne la
 * personne qui s'en va.
 */
export function isDirty(draft: MealDraft, saved: MealSummary | null): boolean {
  if (saved === null) return draft.lines.length > 0
  if (draft.schedule.plannedFor !== saved.plannedFor || draft.schedule.type !== saved.type) return true
  if (draft.lines.length !== saved.entries.length) return true
  return draft.lines.some((line) => {
    const entry = saved.entries.find((candidate) => candidate.entryId === line.entryId)
    return entry === undefined || entry.grams !== line.grams
  })
}

/** Les lignes à transmettre à l'enregistrement. */
export function linesToSave(draft: MealDraft): readonly MealDraftLine[] {
  return draft.lines.map((line) => ({
    ...(line.entryId === null ? {} : { entryId: line.entryId }),
    foodItemId: line.foodItemId,
    grams: line.grams,
    measure: line.measure.label,
  }))
}
