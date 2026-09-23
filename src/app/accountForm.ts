import { computed, type ComputedRef } from 'vue'

import { LINK_TOKEN_PARAM } from '@/contract/account'
import type { ErrorView } from '@/core/errors'
import { PASSWORD_MIN_LENGTH } from '@/modules/account/domain/PasswordPolicy'

/** Aide affichée sous tout champ de nouveau mot de passe. */
export const NEW_PASSWORD_HINT = `${PASSWORD_MIN_LENGTH} caractères minimum, sans autre contrainte. Une phrase de quelques mots est idéale.`

/**
 * Répartit une erreur de compte entre les champs et le bandeau.
 *
 * Une adresse mal formée ou un mot de passe trop court concernent **un** champ :
 * l'erreur s'affiche sous lui et lui est liée par `aria-describedby`, ce que
 * demande le critère 3.3.1. Le reste — identifiants refusés, serveur absent —
 * concerne le formulaire entier et va dans le bandeau.
 */
export function useAccountFormErrors(error: () => ErrorView | null): {
  readonly emailError: ComputedRef<string | undefined>
  readonly passwordError: ComputedRef<string | undefined>
  readonly formError: ComputedRef<ErrorView | null>
} {
  const code = computed(() => error()?.code)

  return {
    emailError: computed(() =>
      code.value === 'INVALID_EMAIL'
        ? 'Adresse e-mail invalide. Exemple : camille@exemple.fr'
        : undefined,
    ),
    passwordError: computed(() =>
      code.value === 'WEAK_PASSWORD'
        ? `Mot de passe trop court : ${PASSWORD_MIN_LENGTH} caractères minimum.`
        : undefined,
    ),
    formError: computed(() =>
      code.value === 'INVALID_EMAIL' || code.value === 'WEAK_PASSWORD' ? null : error(),
    ),
  }
}

/**
 * Jeton d'un lien reçu par e-mail, lu dans le fragment de l'adresse
 * (`#token=…`). Le fragment n'est jamais envoyé au serveur qui sert la page : le
 * jeton n'apparaît dans aucun journal d'accès.
 */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get(LINK_TOKEN_PARAM)
  return token === null || token === '' ? null : token
}
