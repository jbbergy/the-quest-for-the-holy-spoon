import { type Ref, ref, watch } from 'vue'

import { useContainer } from '@/app/container'
import { type DayKey, dateOfDay } from '@/core/day'
import type { AccountId, PlayerId } from '@/core/identity'
import type { HouseholdView } from '@/modules/household/application'

/**
 * Calories mangées aujourd'hui par chaque membre du foyer, pour la liste des
 * membres : `null` tant qu'elles ne sont pas connues, ou si elles ne le
 * seront pas (journée non partagée, serveur injoignable).
 *
 * Les siennes se lisent sur l'appareil, par le même use case que l'accueil ;
 * celles des autres, sur le serveur, et seulement pour qui partage ses
 * journées — le serveur refuserait les autres. Seuls les repas cochés
 * « Mangé » comptent, comme dans les jauges.
 *
 * Une lecture plus ancienne qui arrive après une plus récente est ignorée :
 * changer de jour ou de foyer ne doit pas afficher les chiffres d'avant.
 */
export function useMembersToday(
  household: () => HouseholdView | null,
  self: () => AccountId | null,
  today: () => DayKey,
): Ref<ReadonlyMap<PlayerId, number | null>> {
  const eaten = ref<ReadonlyMap<PlayerId, number | null>>(new Map())
  let reading = 0

  async function eatenBy(playerId: PlayerId, mine: boolean, day: DayKey): Promise<number | null> {
    const container = useContainer()
    if (mine) {
      const journal = await container.inventory.journal.execute(playerId, dateOfDay(day))
      return journal.ok ? journal.value.totalCalories : null
    }
    const meals = await container.memberDays.meals(playerId, day, day)
    if (!meals.ok) return null
    return meals.value
      .filter((meal) => meal.consumedAt !== null)
      .reduce((sum, meal) => sum + meal.calories, 0)
  }

  async function load(): Promise<void> {
    const current = ++reading
    const day = today()
    const members = (household()?.members ?? []).flatMap((member) => {
      const mine = member.accountId === self()
      return member.playerId !== null && (mine || member.sharesDays)
        ? [{ playerId: member.playerId, mine }]
        : []
    })

    const figures = await Promise.all(
      members.map(async ({ playerId, mine }) => [playerId, await eatenBy(playerId, mine, day)] as const),
    )
    if (current === reading) eaten.value = new Map(figures)
  }

  watch([household, self, today], load, { immediate: true })

  return eaten
}
