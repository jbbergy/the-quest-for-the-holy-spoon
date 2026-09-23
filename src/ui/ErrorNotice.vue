<script setup lang="ts">
/**
 * Message d'erreur destiné à l'utilisateur.
 *
 * Il traduit le `code` d'une erreur typée en phrase compréhensible. Le `message`
 * d'origine, rédigé pour le développeur, n'est jamais affiché : il parle de
 * repositories et de payloads.
 */
import type { ErrorView } from '@/core/errors'
import { computed } from 'vue'

const props = defineProps<{ error: ErrorView | null }>()

const MESSAGES: Readonly<Record<string, string>> = {
  INVALID_PORTION: 'La quantité doit être un nombre supérieur à zéro.',
  INVALID_MACROS: 'Les valeurs nutritionnelles doivent être positives.',
  INVALID_MEASUREMENT: 'Ces mesures sortent des valeurs plausibles.',
  INVALID_PLAYER: 'Le nom du profil est obligatoire.',
  INCOMPATIBLE_DIETARY_RESTRICTION: 'Ces régimes ne peuvent pas être combinés.',
  INVALID_FOOD_ITEM: 'Cette fiche d’aliment est incomplète.',
  INVALID_MEAL: 'Cette modification du repas est impossible.',
  FOOD_NOT_FOUND: 'Cet aliment est introuvable dans le catalogue.',
  MEAL_NOT_FOUND: 'Ce repas n’existe plus.',
  NO_CURRENT_PROFILE: 'Aucun profil actif : commencez par en créer un.',
  STORAGE_QUOTA_EXCEEDED: 'L’espace de stockage est plein. Supprimez d’anciens repas.',
  STORAGE_UNAVAILABLE: 'Le stockage local est indisponible sur cet appareil.',
  REMOTE_UNAVAILABLE: 'La recherche en ligne est indisponible.',
  UNKNOWN_THEME: 'Ce thème n’existe plus.',
  INVALID_EMAIL: 'Cette adresse e-mail n’est pas valide.',
  WEAK_PASSWORD: 'Le mot de passe doit compter au moins 12 caractères.',
  INVALID_CREDENTIALS: 'Adresse ou mot de passe incorrect.',
  EMAIL_NOT_VERIFIED:
    'Votre adresse n’est pas encore confirmée : un nouveau lien vient de vous être envoyé.',
  TOKEN_INVALID: 'Ce lien a déjà servi ou a expiré. Demandez-en un nouveau.',
  RATE_LIMITED: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  PLAYER_ALREADY_LINKED: 'Ce profil est déjà rattaché à un autre compte.',
  NOT_AUTHENTICATED: 'Votre session a expiré : reconnectez-vous.',
  SERVER_UNREACHABLE: 'Le serveur ne répond pas. Vérifiez votre connexion, puis réessayez.',
  INVALID_HOUSEHOLD_NAME: 'Le nom du foyer doit compter de 1 à 60 caractères.',
  NOT_HOUSEHOLD_OWNER: 'Seul le propriétaire du foyer peut faire cela.',
  NO_HOUSEHOLD: 'Vous ne faites plus partie d’aucun foyer.',
  ALREADY_IN_HOUSEHOLD:
    'Vous faites déjà partie d’un foyer : quittez-le avant d’en créer ou d’en rejoindre un autre.',
  ALREADY_HOUSEHOLD_MEMBER: 'Cette personne fait déjà partie du foyer.',
  ALREADY_INVITED: 'Une invitation attend déjà la réponse de cette personne.',
  HOUSEHOLD_FULL: 'Le foyer est complet : 12 membres au plus, invitations en attente comprises.',
  INVITATION_NOT_FOUND: 'Cette invitation n’existe plus : elle a expiré ou a été annulée.',
  MEMBER_NOT_FOUND: 'Cette personne ne fait plus partie du foyer.',
  OWNER_CANNOT_LEAVE: 'Le propriétaire ne quitte pas son foyer : il peut le dissoudre.',
  HOUSEHOLD_CONFLICT:
    'Le foyer a changé entre-temps. Voici son état actuel : réessayez si besoin.',
}

const text = computed(() =>
  props.error === null
    ? ''
    : (MESSAGES[props.error.code] ?? 'Une erreur est survenue. Réessayez.'),
)
</script>

<template>
  <p
    v-if="error"
    class="notice"
    role="alert"
  >
    <span aria-hidden="true">⚠</span>
    <span>{{ text }}</span>
  </p>
</template>

<style scoped lang="scss">
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
</style>
