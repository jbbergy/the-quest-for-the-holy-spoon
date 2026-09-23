<script setup lang="ts">
/**
 * Réponse à une invitation.
 *
 * C'est l'écran du consentement : il dit ce que les autres membres verront, et
 * ce qu'ils ne verront pas, **avant** qu'on accepte. Rien n'est partagé tant
 * que la personne n'a pas appuyé sur « Rejoindre ».
 */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

import { formatDay } from './householdFormat'

const route = useRoute()
const router = useRouter()
const account = useAccountStore()
const store = useHousehold()

const invitation = computed(() =>
  store.invitations.find((candidate) => candidate.id === route.params.invitationId),
)
const busy = computed(() => store.status === 'loading')

async function accept(): Promise<void> {
  if (invitation.value === undefined) return
  store.clearError()
  if (await store.accept(invitation.value.id)) await router.push({ name: ROUTE.household })
}

async function decline(): Promise<void> {
  if (invitation.value === undefined) return
  store.clearError()
  if (await store.decline(invitation.value.id)) await router.push({ name: ROUTE.household })
}
</script>

<template>
  <div class="invitation">
    <p class="invitation__back">
      <RouterLink :to="{ name: ROUTE.household }">
        ← Foyer
      </RouterLink>
    </p>

    <template v-if="invitation">
      <h1>Rejoindre « {{ invitation.householdName }} » ?</h1>
      <p class="invitation__from">
        Invitation de <strong>{{ invitation.invitedBy }}</strong>, valable jusqu’au
        {{ formatDay(invitation.expiresAt) }}.
      </p>

      <ErrorNotice :error="store.error" />

      <BaseCard title="Ce que les membres verront">
        <ul class="invitation__points">
          <li>Vos repas, prévus et pris.</li>
          <li>Vos jauges de la journée et vos moyennes des sept derniers jours.</li>
          <li>Les aliments que vous créez, qu’ils pourront ajouter à leurs repas.</li>
          <li>
            Vos besoins estimés, sans lesquels vos jauges n’auraient pas de repère.
          </li>
          <li>Votre adresse e-mail, qui vous désigne dans la liste des membres.</li>
        </ul>
        <p class="invitation__note">
          Un membre pourra aussi prévoir un repas pour vous : il apparaîtra dans votre semaine,
          et vous restez seul à le cocher comme pris.
        </p>
      </BaseCard>

      <BaseCard title="Ce qui reste privé">
        <ul class="invitation__points">
          <li>
            Vos mensurations — poids, taille, âge — dont on ne partage que les besoins qui en
            découlent.
          </li>
        </ul>
        <p class="invitation__note">
          Vous pourrez cesser de partager vos journées à tout moment dans les réglages, et quitter
          le foyer quand vous le voudrez.
        </p>
      </BaseCard>

      <p
        v-if="store.household"
        class="invitation__blocked"
        role="note"
      >
        Vous faites déjà partie de « {{ store.household.name }} ». Un compte n’appartient qu’à un
        foyer : quittez-le d’abord pour rejoindre celui-ci.
      </p>

      <div class="invitation__actions">
        <BaseButton
          :disabled="store.household !== null"
          :loading="busy"
          @click="accept"
        >
          Rejoindre le foyer
        </BaseButton>
        <BaseButton
          variant="secondary"
          :loading="busy"
          @click="decline"
        >
          Refuser
        </BaseButton>
      </div>
    </template>

    <template v-else>
      <h1>Invitation</h1>
      <ErrorNotice :error="store.error" />
      <p v-if="!account.session">
        Connectez-vous avec l’adresse qui a reçu l’invitation pour y répondre.
      </p>
      <p v-else-if="!store.loaded && store.status !== 'error' && store.status !== 'unreachable'">
        Chargement de l’invitation…
      </p>
      <p v-else>
        Cette invitation n’existe plus : elle a expiré, a été annulée, ou vous y avez déjà
        répondu.
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.invitation {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.invitation__back {
  margin: 0;
  font-size: var(--font-size-sm);
}

.invitation__from {
  margin: 0;
  color: var(--color-text-muted);
}

.invitation__points {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-5);
}

.invitation__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.invitation__blocked {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.invitation__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
