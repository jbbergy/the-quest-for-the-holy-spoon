import { useContainer } from '@/app/container'
import type { ConnectOutcome } from '@/app/sync/SyncEngine'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

export interface SignOutOutcome {
  readonly signedOut: boolean
  /** Modifications qui n'ont pas pu partir et seraient perdues. */
  readonly pending: number
}

/**
 * Le compte, le profil et la synchronisation, coordonnés.
 *
 * Trois contextes se rencontrent ici — `account` connaît la session,
 * `player_profile` le profil, la synchronisation l'appareil — et c'est donc
 * dans `src/app/` que cette coordination vit, jamais dans un store.
 */
export function useAccountSync() {
  const account = useAccountStore()
  const players = usePlayerStore()
  const engine = useContainer().sync

  /**
   * Rattache le profil de l'appareil au compte s'il n'en a pas encore. Un
   * compte déjà rattaché à un autre profil n'est pas touché : c'est son profil
   * qui sera téléchargé.
   */
  async function linkLocalProfile(): Promise<void> {
    const session = account.session
    const playerId = players.playerId
    if (session === null || playerId === null || session.playerId !== null) return

    await account.linkPlayer(playerId)
  }

  /**
   * Branche l'appareil sur le compte connecté. Appelé à chaque occasion où
   * compte et profil peuvent se rencontrer : démarrage, connexion, lien reçu
   * par e-mail, création du profil.
   */
  async function connect(): Promise<ConnectOutcome | null> {
    await linkLocalProfile()
    const session = account.session
    if (session === null || session.playerId === null) return null

    const result = await engine.connect(
      { accountId: session.accountId, playerId: session.playerId },
      players.playerId,
    )
    if (!result.ok) return null
    if (result.value === 'downloaded') await players.load()
    return result.value
  }

  /**
   * Déconnexion : un dernier envoi, puis l'effacement de la copie locale du
   * compte — l'appareil peut être partagé. Si des modifications n'ont pas pu
   * partir, rien n'est fait sans `force` : c'est à la personne de décider.
   */
  async function signOut(options: { readonly force?: boolean } = {}): Promise<SignOutOutcome> {
    const pending = engine.status.phase === 'off' ? 0 : await engine.flush()
    if (pending > 0 && options.force !== true) return { signedOut: false, pending }

    if (!(await account.signOut())) return { signedOut: false, pending: 0 }
    await engine.disconnect({ wipe: true })
    await players.load()
    return { signedOut: true, pending: 0 }
  }

  /**
   * Suppression du compte : le serveur efface ses données, l'appareil garde les
   * siennes et redevient un usage sans compte.
   */
  async function deleteAccount(password: string): Promise<boolean> {
    if (!(await account.deleteAccount(password))) return false
    await engine.disconnect({ wipe: false })
    return true
  }

  return { linkLocalProfile, connect, signOut, deleteAccount }
}
