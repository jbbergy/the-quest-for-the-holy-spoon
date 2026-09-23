import type { AccountId } from '@/core/identity'
import type { Email } from '@/core/Email'

import type { Account } from './Account'
import type { EmailTokenPurpose } from './policies'

/**
 * Ports du module `account` côté serveur.
 *
 * Contrairement aux ports du client, ils ne renvoient pas de `Result` pour les
 * pannes techniques : une base injoignable n'est pas un cas métier que la route
 * saurait traiter, c'est une erreur 500. Les `Result` sont réservés aux refus
 * métier, que portent les agrégats et les use cases.
 */
export interface IAccountRepository {
  findById(id: AccountId): Promise<Account | null>
  findByEmail(email: Email): Promise<Account | null>
  /** Vrai si un **autre** compte que `except` est déjà rattaché à ce profil. */
  isPlayerTaken(playerId: string, except: AccountId): Promise<boolean>
  save(account: Account): Promise<void>
  delete(id: AccountId): Promise<void>
}

export interface SessionRecord {
  readonly accountId: AccountId
  readonly expiresAt: Date
}

/** Les jetons y entrent en clair et n'y sont conservés qu'en empreinte. */
export interface ISessionStore {
  open(accountId: AccountId, expiresAt: Date): Promise<string>
  find(token: string, now: Date): Promise<SessionRecord | null>
  extend(token: string, expiresAt: Date): Promise<void>
  close(token: string): Promise<void>
  closeAll(accountId: AccountId): Promise<void>
}

export interface IEmailTokenStore {
  /** Émet un lien à usage unique et révoque les liens antérieurs de même nature. */
  issue(accountId: AccountId, purpose: EmailTokenPurpose, expiresAt: Date): Promise<string>
  /** Consomme un lien valide ; `null` s'il est inconnu, périmé ou déjà utilisé. */
  consume(token: string, purpose: EmailTokenPurpose, now: Date): Promise<AccountId | null>
}

export interface IPasswordHasher {
  hash(password: string): Promise<string>
  verify(passwordHash: string, password: string): Promise<boolean>
  /**
   * Vérification factice, du même coût qu'une vraie : appelée quand l'adresse
   * n'a pas de compte, pour que le chronomètre ne révèle rien.
   */
  burn(password: string): Promise<void>
}

/** Messages que le compte envoie à son titulaire. `linkBase` : origine de l'application. */
export interface IAccountNotifier {
  confirmAddress(to: Email, token: string, linkBase: string): Promise<void>
  alreadyRegistered(to: Email, resetToken: string, linkBase: string): Promise<void>
  resetPassword(to: Email, token: string, linkBase: string): Promise<void>
}

export type Clock = () => Date
