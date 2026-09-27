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
        <strong>{{ invitation.invitedBy }}</strong> vous invite. L’invitation est valable
        jusqu’au {{ formatDay(invitation.expiresAt) }}.
      </p>

      <ErrorNotice :error="store.error" />

      <BaseCard title="Ce que les autres membres verront">
        <ul class="invitation__points">
          <li>Vos repas, prévus et mangés.</li>
          <li>Vos jauges de la journée, et vos moyennes des 7 derniers jours.</li>
          <li>Les aliments que vous créez. Ils pourront les ajouter à leurs repas.</li>
          <li>Votre besoin par jour. Sans lui, vos jauges ne voudraient rien dire.</li>
          <li>Votre adresse e-mail, dans la liste des membres.</li>
        </ul>
        <p class="invitation__note">
          Un membre pourra aussi prévoir un repas pour vous. Ce repas apparaîtra dans votre
          semaine. Vous seul pourrez cocher « Mangé ».
        </p>
      </BaseCard>

      <BaseCard title="Ce qui reste privé">
        <ul class="invitation__points">
          <li>
            Votre taille, votre poids et votre âge. Personne d’autre ne les voit.
          </li>
        </ul>
        <p class="invitation__note">
          Vous pourrez cacher vos journées à tout moment, dans les réglages. Vous pourrez aussi
          quitter le foyer quand vous voulez.
        </p>
      </BaseCard>

      <p
        v-if="store.household"
        class="invitation__blocked"
        role="note"
      >
        Vous faites déjà partie du foyer « {{ store.household.name }} ». On ne peut faire partie
        que d’un seul foyer. Quittez d’abord le vôtre pour rejoindre celui-ci.
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
        Pour répondre, connectez-vous avec l’adresse e-mail qui a reçu l’invitation.
      </p>
      <p v-else-if="!store.loaded && store.status !== 'error' && store.status !== 'unreachable'">
        Chargement de l’invitation…
      </p>
      <p v-else>
        Cette invitation n’existe plus. Elle est peut-être trop ancienne, ou elle a été annulée.
        Ou bien vous y avez déjà répondu.
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
