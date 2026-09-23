import { type Algorithm, hash, verify } from '@node-rs/argon2'

import type { IPasswordHasher } from '../domain/ports'

/**
 * argon2id, paramètres minimaux recommandés par l'OWASP (19 Mio, 2 passes).
 * C'est volontairement lent — quelques dizaines de millisecondes par essai —
 * pour rendre une base volée inexploitable.
 */
const ARGON2 = {
  // `Algorithm.Argon2id` : l'énumération est un `const enum` ambiant, que
  // `verbatimModuleSyntax` interdit de lire à l'exécution.
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

export class Argon2PasswordHasher implements IPasswordHasher {
  private dummyHash: Promise<string> | null = null

  hash(password: string): Promise<string> {
    return hash(password.normalize('NFC'), ARGON2)
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password.normalize('NFC'))
    } catch {
      return false
    }
  }

  async burn(password: string): Promise<void> {
    this.dummyHash ??= this.hash('mot de passe factice, jamais attribué')
    await this.verify(await this.dummyHash, password)
  }
}
