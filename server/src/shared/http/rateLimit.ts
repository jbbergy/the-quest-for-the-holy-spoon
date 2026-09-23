import { API_ERROR } from '@/contract/http'

import { HttpError } from './errors'

export interface RateRule {
  readonly limit: number
  readonly windowMs: number
}

/**
 * Limiteur à fenêtre fixe, en mémoire.
 *
 * Suffisant pour une instance unique : il freine le bourrage d'identifiants et
 * l'envoi d'e-mails en rafale. Plusieurs instances derrière un répartiteur
 * demanderaient un compteur partagé — ce sera un autre adaptateur, pas une
 * réécriture des routes.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Compte une tentative ; lève `429` si la limite de la fenêtre est dépassée. */
  hit(key: string, rule: RateRule): void {
    const now = this.now().getTime()
    const window = this.windows.get(key)

    if (window === undefined || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + rule.windowMs })
      this.prune(now)
      return
    }

    window.count += 1
    if (window.count > rule.limit) {
      throw new HttpError(429, API_ERROR.rateLimited, 'Trop de tentatives, réessayez plus tard.')
    }
  }

  /** Oublie les fenêtres échues, pour que la table ne grossisse pas sans fin. */
  private prune(now: number): void {
    if (this.windows.size < 10_000) return
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const RATE = {
  signInPerEmail: { limit: 10, windowMs: 15 * MINUTE },
  signInPerIp: { limit: 50, windowMs: 15 * MINUTE },
  mailPerEmail: { limit: 5, windowMs: HOUR },
  mailPerIp: { limit: 20, windowMs: HOUR },
  tokenPerIp: { limit: 30, windowMs: HOUR },
} as const satisfies Record<string, RateRule>
