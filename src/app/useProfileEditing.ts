import { ref, type Ref } from 'vue'

import { useContainer } from '@/app/container'
import { useTodayStore } from '@/app/day/useTodayStore'
import { type ErrorView, toErrorView } from '@/core/errors'
import { portionScale } from '@/modules/nutrition_inventory/application'
import type { ProfileUpdate } from '@/modules/player_profile/application'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

export interface ProfileSaveOutcome {
  /** Nombre de repas prévus dont les portions ont été ajustées. */
  readonly rescaledMeals: number
}

/**
 * Modifier son profil, et ce qui en découle.
 *
 * Les besoins se recalculent d'eux-mêmes : ils dérivent du profil. Les repas
 * **prévus** à partir d'aujourd'hui, eux, ont été composés pour les anciens
 * besoins ; leurs portions suivent le rapport du nouveau besoin à l'ancien.
 * Les repas pris et les jours passés ne bougent pas — l'historique des besoins
 * garde de quoi les juger comme ils l'étaient.
 *
 * Deux contextes sont en jeu, le profil et les repas : leur coordination vit
 * ici, dans `src/app`, jamais d'un store à l'autre.
 */
export function useProfileEditing(): {
  readonly saving: Ref<boolean>
  readonly mealsError: Ref<ErrorView | null>
  save(changes: ProfileUpdate): Promise<ProfileSaveOutcome | null>
} {
  const players = usePlayerStore()
  const clock = useTodayStore()
  const saving = ref(false)
  const mealsError = ref<ErrorView | null>(null)

  async function save(changes: ProfileUpdate): Promise<ProfileSaveOutcome | null> {
    saving.value = true
    mealsError.value = null
    try {
      const today = clock.today
      const before = players.needs?.targetCalories ?? null
      if (!(await players.update(changes, today))) return null

      const playerId = players.playerId
      const after = players.needs?.targetCalories ?? null
      const scale = portionScale(before, after)
      if (playerId === null || Math.abs(scale - 1) < 0.001) return { rescaledMeals: 0 }

      const rescaled = await useContainer().inventory.rescalePlanned.execute(
        playerId,
        today,
        scale,
      )
      // Le profil est enregistré : un échec ici ne l'annule pas, il se dit.
      if (!rescaled.ok) {
        mealsError.value = toErrorView(rescaled.error)
        return { rescaledMeals: 0 }
      }
      return { rescaledMeals: rescaled.value }
    } finally {
      saving.value = false
    }
  }

  return { saving, mealsError, save }
}
