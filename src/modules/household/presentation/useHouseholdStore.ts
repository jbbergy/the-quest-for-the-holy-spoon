import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { AccountId, InvitationId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { HouseholdView, ReceivedInvitationView } from '../application'

/**
 * `unreachable` : le serveur n'a pas répondu au chargement. Le foyer n'existe
 * qu'en ligne ; l'interface le dit plutôt que d'afficher un foyer vide.
 */
export type HouseholdStatus = 'idle' | 'loading' | 'ready' | 'unreachable' | 'error'

/**
 * Adaptateur d'état du foyer : il appelle un use case, déplie le `Result`, et
 * garde la dernière vue que le serveur a renvoyée. Aucune règle ici.
 */
export const useHouseholdStore = defineStore('household', () => {
  const household = shallowRef<HouseholdView | null>(null)
  const invitations = shallowRef<readonly ReceivedInvitationView[]>([])
  const status = ref<HouseholdStatus>('idle')
  const error = ref<ErrorView | null>(null)
  /** Un premier chargement a abouti : `household` à `null` veut alors vraiment dire « aucun foyer ». */
  const loaded = ref(false)

  const isOwner = computed(() => household.value?.role === 'owner')

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = 'error'
    // Le foyer a changé entre-temps : on montre son état actuel, pour que la
    // nouvelle tentative parte de ce qui existe vraiment.
    if (cause.code === 'HOUSEHOLD_CONFLICT') void refresh()
    return false
  }

  function succeed(): true {
    error.value = null
    status.value = 'ready'
    return true
  }

  /** Applique une réponse qui porte le foyer à jour. */
  function settle(result: Result<HouseholdView | null, BaseError>): boolean {
    if (!result.ok) return fail(result.error)
    household.value = result.value
    return succeed()
  }

  async function refresh(): Promise<void> {
    const result = await useContainer().household.get.execute()
    if (result.ok) household.value = result.value
  }

  async function loadInvitations(): Promise<boolean> {
    const result = await useContainer().household.receivedInvitations.execute()
    if (!result.ok) return fail(result.error)
    invitations.value = result.value
    return true
  }

  function failLoading(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = cause.code === 'SERVER_UNREACHABLE' ? 'unreachable' : 'error'
    return false
  }

  async function load(): Promise<boolean> {
    status.value = 'loading'
    const { household: useCases } = useContainer()
    const [current, received] = await Promise.all([
      useCases.get.execute(),
      useCases.receivedInvitations.execute(),
    ])

    if (!current.ok) return failLoading(current.error)
    if (!received.ok) return failLoading(received.error)
    household.value = current.value
    invitations.value = received.value
    loaded.value = true
    return succeed()
  }

  async function create(name: string): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().household.create.execute(name))
  }

  async function invite(email: string): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().household.invite.execute(email)
    if (!result.ok) return fail(result.error)
    // La réponse est muette : la liste des invitations en attente se relit.
    await refresh()
    return succeed()
  }

  async function revoke(invitationId: InvitationId): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().household.revoke.execute(invitationId))
  }

  async function removeMember(accountId: AccountId): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().household.removeMember.execute(accountId))
  }

  async function setDaySharing(sharesDays: boolean): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().household.setDaySharing.execute(sharesDays))
  }

  /** Quitter ou dissoudre : on redevient seul, et d'autres invitations peuvent attendre. */
  async function departWith(result: Result<void, BaseError>): Promise<boolean> {
    if (!result.ok) return fail(result.error)
    household.value = null
    await loadInvitations()
    return succeed()
  }

  async function leave(): Promise<boolean> {
    status.value = 'loading'
    return departWith(await useContainer().household.leave.execute())
  }

  async function dissolve(): Promise<boolean> {
    status.value = 'loading'
    return departWith(await useContainer().household.dissolve.execute())
  }

  const withoutInvitation = (invitationId: InvitationId): readonly ReceivedInvitationView[] =>
    invitations.value.filter((invitation) => invitation.id !== invitationId)

  async function accept(invitationId: InvitationId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().household.accept.execute(invitationId)
    if (!result.ok) return fail(result.error)
    household.value = result.value
    invitations.value = withoutInvitation(invitationId)
    return succeed()
  }

  async function decline(invitationId: InvitationId): Promise<boolean> {
    status.value = 'loading'
    const result = await useContainer().household.decline.execute(invitationId)
    if (!result.ok) return fail(result.error)
    invitations.value = withoutInvitation(invitationId)
    return succeed()
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = 'ready'
  }

  /** Déconnexion : rien du foyer ne reste en mémoire. */
  function reset(): void {
    household.value = null
    invitations.value = []
    error.value = null
    status.value = 'idle'
    loaded.value = false
  }

  return {
    household,
    invitations,
    status,
    error,
    loaded,
    isOwner,
    load,
    create,
    invite,
    revoke,
    removeMember,
    setDaySharing,
    leave,
    dissolve,
    accept,
    decline,
    clearError,
    reset,
  }
})
