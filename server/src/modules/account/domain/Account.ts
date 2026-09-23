import type { AccountId, PlayerId } from '@/core/identity'
import { err, ok, type Result } from '@/core/result'
import type { Email } from '@/core/Email'

import { AccountAlreadyVerifiedError, PlayerAlreadyLinkedError } from './errors'

export interface AccountProps {
  readonly id: AccountId
  readonly email: Email
  /** Empreinte argon2id — le mot de passe clair ne traverse jamais le domaine. */
  readonly passwordHash: string
  readonly emailVerifiedAt: Date | null
  readonly playerId: PlayerId | null
}

/**
 * Compte utilisateur — agrégat **serveur**.
 *
 * Il vit côté serveur parce qu'il porte l'empreinte du mot de passe, que le
 * client ne voit jamais. Les règles qu'il partage avec le client (forme de
 * l'adresse, politique de mot de passe) viennent du domaine `account` de
 * l'application : elles sont écrites une seule fois.
 *
 * Invariants :
 * - une adresse **confirmée** ne change plus de mot de passe par une nouvelle
 *   inscription — seulement par un lien de réinitialisation reçu à cette adresse ;
 * - un compte n'est rattaché qu'à **un** profil, une fois pour toutes.
 */
export class Account {
  private constructor(private readonly props: AccountProps) {}

  /** Nouveau compte, en attente de confirmation de l'adresse. */
  static register(props: Pick<AccountProps, 'id' | 'email' | 'passwordHash'>): Account {
    return new Account({ ...props, emailVerifiedAt: null, playerId: null })
  }

  static reconstitute(props: AccountProps): Account {
    return new Account(props)
  }

  get id(): AccountId {
    return this.props.id
  }

  get email(): Email {
    return this.props.email
  }

  get passwordHash(): string {
    return this.props.passwordHash
  }

  get emailVerifiedAt(): Date | null {
    return this.props.emailVerifiedAt
  }

  get playerId(): PlayerId | null {
    return this.props.playerId
  }

  get isVerified(): boolean {
    return this.props.emailVerifiedAt !== null
  }

  /** Cliquer sur le lien reçu prouve la possession de l'adresse. La date de la première preuve est conservée. */
  verifyEmail(at: Date): Account {
    return this.isVerified ? this : new Account({ ...this.props, emailVerifiedAt: at })
  }

  /**
   * Nouvelle inscription sur une adresse encore non confirmée : la dernière
   * l'emporte. Sans cela, quiconque inscrirait l'adresse d'autrui en premier en
   * garderait le mot de passe.
   */
  replacePendingPassword(passwordHash: string): Result<Account, AccountAlreadyVerifiedError> {
    if (this.isVerified) return err(new AccountAlreadyVerifiedError())
    return ok(new Account({ ...this.props, passwordHash }))
  }

  /**
   * Changement par lien de réinitialisation : le lien est arrivé dans la boîte,
   * l'adresse est donc prouvée du même coup.
   */
  resetPassword(passwordHash: string, at: Date): Account {
    return new Account({ ...this.props, passwordHash }).verifyEmail(at)
  }

  linkPlayer(playerId: PlayerId): Result<Account, PlayerAlreadyLinkedError> {
    if (this.props.playerId === playerId) return ok(this)
    if (this.props.playerId !== null) {
      return err(new PlayerAlreadyLinkedError('Ce compte est déjà rattaché à un autre profil.'))
    }
    return ok(new Account({ ...this.props, playerId }))
  }
}
