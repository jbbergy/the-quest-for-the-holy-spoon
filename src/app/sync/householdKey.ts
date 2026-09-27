import type { HouseholdView } from '@/modules/household/application'

/**
 * Empreinte du foyer : son identifiant et ses membres. Quand elle change, les
 * données partagées se relisent depuis le début — celles d'un nouveau venu
 * datent d'avant le curseur de synchronisation.
 */
export function householdKey(household: HouseholdView | null): string | null {
  if (household === null) return null
  const members = household.members.map((member) => member.accountId).sort()
  return `${household.id}:${members.join(',')}`
}

/** Identifiant du foyer contenu dans une empreinte, ou `null` sans foyer. */
export function householdIdOfKey(key: string | null | undefined): string | null {
  if (key == null) return null
  const id = key.split(':')[0]
  return id === undefined || id === '' ? null : id
}
