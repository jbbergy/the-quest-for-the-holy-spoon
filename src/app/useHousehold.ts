import { watch } from 'vue'

import { useContainer } from '@/app/container'
import { householdKey } from '@/app/sync/householdKey'
import type { PlayerId } from '@/core/identity'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import type { HouseholdView } from '@/modules/household/application'
import { useHouseholdStore } from '@/modules/household/presentation/useHouseholdStore'

export { householdKey }

/**
 * Le foyer du compte connecté, chargé dès que la session est connue.
 *
 * La session arrive souvent après le montage — elle est lue sans bloquer la
 * navigation — et le foyer ne peut se charger qu'avec elle. Plusieurs
 * contextes se rencontrent ici — compte, foyer, synchronisation : la
 * coordination vit donc dans `src/app/`, pas dans un store.
 */
export function useHousehold() {
  const account = useAccountStore()
  const household = useHouseholdStore()
  const engine = useContainer().sync

  watch(
    () => account.session,
    (session) => {
      if (session !== null && household.status === 'idle') void household.load()
    },
    { immediate: true },
  )

  // Seulement une fois le foyer réellement lu : avant, `null` voudrait dire
  // « pas encore su », pas « aucun foyer ».
  watch(
    () => (household.loaded ? householdKey(household.household) : undefined),
    (key) => {
      if (key !== undefined) void engine.rebase(key)
    },
    { immediate: true },
  )

  return household
}

/**
 * Nom sous lequel un membre apparaît : celui de son profil, sinon son adresse.
 * `null` si le profil n'est pas celui d'un membre connu.
 */
export function memberName(household: HouseholdView | null, playerId: PlayerId): string | null {
  const member = household?.members.find((candidate) => candidate.playerId === playerId)
  return member === undefined ? null : (member.name ?? member.email)
}

/**
 * Auteur d'un aliment à afficher, ou `null` quand c'est le sien (ou une fiche
 * de catalogue, sans auteur).
 */
export function foodAuthor(
  household: HouseholdView | null,
  self: PlayerId | null,
  ownerId: PlayerId | null,
): string | null {
  if (ownerId === null || ownerId === self) return null
  return memberName(household, ownerId) ?? 'un membre du foyer'
}
