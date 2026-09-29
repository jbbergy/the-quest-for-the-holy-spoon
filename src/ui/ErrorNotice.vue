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

/**
 * Une phrase simple par erreur, puis ce qu'il faut faire. Pas de mot technique :
 * la personne doit comprendre ce qui s'est passé sans connaître l'application.
 */
const MESSAGES: Readonly<Record<string, string>> = {
  INVALID_PORTION: 'La quantité doit être un nombre plus grand que 0.',
  INVALID_MACROS: 'Les valeurs doivent être des nombres positifs.',
  INVALID_NUTRIENTS: 'Les valeurs doivent être des nombres positifs.',
  INVALID_MEASUREMENT:
    'Une mesure semble fausse. Vérifiez votre taille (en cm), votre poids (en kg) et votre âge.',
  INVALID_PLAYER: 'Écrivez un prénom ou un surnom, de 60 lettres au plus.',
  INCOMPATIBLE_DIETARY_RESTRICTION:
    'Ces régimes ne vont pas ensemble. Par exemple : végan et pescétarien. Gardez-en un seul.',
  INVALID_FOOD_ITEM:
    'Cet aliment n’est pas complet. Vérifiez son nom, son code-barres et ses portions.',
  INVALID_MEAL: 'Ce changement n’est pas possible sur ce repas.',
  FOOD_NOT_FOUND: 'Cet aliment n’existe plus.',
  FOOD_READ_ONLY: 'Cet aliment vient d’un catalogue. Vous ne pouvez pas le modifier.',
  MEAL_NOT_FOUND: 'Ce repas n’existe plus.',
  NO_CURRENT_PROFILE: 'Il n’y a pas encore de profil. Créez d’abord votre profil.',
  STORAGE_QUOTA_EXCEEDED:
    'L’appareil n’a plus de place. Libérez de la place, puis réessayez.',
  STORAGE_UNAVAILABLE:
    'L’application ne peut pas enregistrer sur cet appareil. Vérifiez que le navigateur n’est pas en navigation privée.',
  REMOTE_UNAVAILABLE: 'La recherche des produits de marque ne répond pas. Réessayez plus tard.',
  UNKNOWN_THEME: 'Ces couleurs n’existent plus. Choisissez-en d’autres.',
  INVALID_EMAIL: 'Cette adresse e-mail n’est pas correcte.',
  WEAK_PASSWORD: 'Ce mot de passe est trop court. Il faut au moins 12 caractères.',
  INVALID_CREDENTIALS: 'L’adresse e-mail ou le mot de passe est faux.',
  EMAIL_NOT_VERIFIED:
    'Votre adresse n’est pas encore confirmée. Nous venons de vous envoyer un nouveau lien : regardez vos e-mails.',
  TOKEN_INVALID: 'Ce lien ne marche plus. Il a déjà servi, ou il est trop ancien. Demandez un nouveau lien.',
  RATE_LIMITED: 'Trop d’essais. Attendez quelques minutes, puis réessayez.',
  PLAYER_ALREADY_LINKED: 'Ce profil est déjà lié à un autre compte.',
  NOT_AUTHENTICATED: 'Vous n’êtes plus connecté. Connectez-vous de nouveau.',
  SERVER_UNREACHABLE: 'Le serveur ne répond pas. Vérifiez votre connexion à Internet, puis réessayez.',
  INVALID_HOUSEHOLD_NAME: 'Le nom du foyer doit avoir de 1 à 60 lettres.',
  NOT_HOUSEHOLD_OWNER: 'Seule la personne responsable du foyer peut faire cela.',
  NO_HOUSEHOLD: 'Vous ne faites plus partie d’un foyer.',
  ALREADY_IN_HOUSEHOLD:
    'Vous faites déjà partie d’un foyer. Quittez-le d’abord pour en créer ou en rejoindre un autre.',
  ALREADY_HOUSEHOLD_MEMBER: 'Cette personne fait déjà partie du foyer.',
  ALREADY_INVITED: 'Cette personne a déjà une invitation. Elle n’a pas encore répondu.',
  HOUSEHOLD_FULL: 'Le foyer est complet : 12 personnes au plus, invitations comprises.',
  INVITATION_NOT_FOUND: 'Cette invitation n’existe plus. Elle est trop ancienne, ou elle a été annulée.',
  MEMBER_NOT_FOUND: 'Cette personne ne fait plus partie du foyer.',
  OWNER_CANNOT_LEAVE:
    'La personne responsable ne peut pas quitter le foyer. Elle peut le supprimer.',
  DAYS_NOT_SHARED: 'Cette personne ne montre pas ses journées pour le moment.',
  NOT_SYNCED: 'Connectez-vous pour prévoir un repas pour le foyer.',
  NOT_OWNER: 'Un autre membre du foyer a créé cet élément. Vous ne pouvez pas le modifier.',
  HOUSEHOLD_CONFLICT:
    'Le foyer a changé pendant ce temps. Voici ce qu’il est maintenant. Réessayez si besoin.',
  INVALID_SHOPPING_ITEM: 'Écrivez le nom de l’article, en 80 lettres au plus.',
  INVALID_RECIPE:
    'Une recette a un nom de 1 à 60 lettres, et au moins un aliment.',
  RECIPE_NAME_TAKEN:
    'Vous avez déjà une recette qui porte ce nom. Choisissez un autre nom, ou supprimez l’ancienne recette.',
  RECIPE_NOT_FOUND: 'Cette recette n’existe plus.',
  RECIPE_NOT_SAVED: 'La recette n’a pas pu être enregistrée. Réessayez.',
  RECIPE_FOODS_MISSING:
    'Les aliments de cette recette ne sont plus dans le catalogue. Le repas reste inchangé.',
  SHOPPING_ITEM_NOT_FOUND: 'Cet article n’est plus dans la liste. Quelqu’un l’a peut-être retiré.',
}

const text = computed(() =>
  props.error === null
    ? ''
    : (MESSAGES[props.error.code] ?? 'Quelque chose n’a pas marché. Réessayez.'),
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
