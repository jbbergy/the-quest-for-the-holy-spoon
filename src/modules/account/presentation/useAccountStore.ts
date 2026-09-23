import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useContainer } from '@/app/container'
import { type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import type { PlayerId } from '@/core/identity'
import type { Result } from '@/core/result'

import type { AccountSession, CredentialsInput } from '../application'

/**
 * `unreachable` : le serveur n'a pas répondu. On ne sait alors pas si une
 * session existe — l'interface ne doit ni la supposer ouverte, ni inviter à se
 * reconnecter.
 */
export type AccountStatus = 'idle' | 'loading' | 'ready' | 'unreachable' | 'error'

/**
 * Adaptateur d'état du compte.
 *
 * Comme les autres stores, il appelle un use case et déplie le `Result`, sans
 * règle métier. Il ne connaît pas le profil : rattacher le profil local au
 * compte est une coordination entre contextes, qui appartient à `src/app/`.
 */
export const useAccountStore = defineStore('account', () => {
  const session = shallowRef<AccountSession | null>(null)
  const status = ref<AccountStatus>('idle')
  const error = ref<ErrorView | null>(null)

  const isSignedIn = computed(() => session.value !== null)

  function fail(cause: BaseError): false {
    error.value = toErrorView(cause)
    status.value = cause.code === 'SERVER_UNREACHABLE' && session.value === null ? 'unreachable' : 'error'
    return false
  }

  /** Applique un `Result` : une session renvoyée remplace l'actuelle. */
  function settle<T>(result: Result<T, BaseError>, next?: (value: T) => AccountSession | null): boolean {
    if (!result.ok) return fail(result.error)
    if (next !== undefined) session.value = next(result.value)
    error.value = null
    status.value = 'ready'
    return true
  }

  const keep = (value: AccountSession): AccountSession => value

  async function load(): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.getSession.execute(), (value) => value)
  }

  async function signUp(input: CredentialsInput): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.signUp.execute(input))
  }

  async function verifyEmail(token: string): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.verifyEmail.execute(token), keep)
  }

  async function signIn(input: CredentialsInput): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.signIn.execute(input), keep)
  }

  async function requestPasswordReset(email: string): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.requestPasswordReset.execute(email))
  }

  async function resetPassword(input: { token: string; password: string }): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.resetPassword.execute(input), keep)
  }

  async function linkPlayer(playerId: PlayerId): Promise<boolean> {
    return settle(await useContainer().account.linkPlayer.execute(playerId), keep)
  }

  async function signOut(): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.signOut.execute(), () => null)
  }

  async function deleteAccount(password: string): Promise<boolean> {
    status.value = 'loading'
    return settle(await useContainer().account.deleteAccount.execute(password), () => null)
  }

  function clearError(): void {
    error.value = null
    if (status.value === 'error') status.value = 'ready'
  }

  return {
    session,
    status,
    error,
    isSignedIn,
    load,
    signUp,
    verifyEmail,
    signIn,
    requestPasswordReset,
    resetPassword,
    linkPlayer,
    signOut,
    deleteAccount,
    clearError,
  }
})
