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
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import RichText from '@/ui/RichText.vue'

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
        {{ t('household.invitation.back') }}
      </RouterLink>
    </p>

    <template v-if="invitation">
      <h1>{{ t('household.invitation.join', { name: invitation.householdName }) }}</h1>
      <p class="invitation__from">
        <RichText
          path="household.invitation.from"
          :params="{ name: invitation.invitedBy, date: formatDay(invitation.expiresAt) }"
        />
      </p>

      <ErrorNotice :error="store.error" />

      <BaseCard :title="t('household.invitation.seenTitle')">
        <ul class="invitation__points">
          <li>{{ t('household.invitation.seen1') }}</li>
          <li>{{ t('household.invitation.seen2') }}</li>
          <li>{{ t('household.invitation.seen3') }}</li>
          <li>{{ t('household.invitation.seen4') }}</li>
          <li>{{ t('household.invitation.seen5') }}</li>
        </ul>
        <p class="invitation__note">
          {{ t('household.invitation.seenNote') }}
        </p>
      </BaseCard>

      <BaseCard :title="t('household.invitation.privateTitle')">
        <ul class="invitation__points">
          <li>{{ t('household.invitation.private1') }}</li>
        </ul>
        <p class="invitation__note">
          {{ t('household.invitation.privateNote') }}
        </p>
      </BaseCard>

      <p
        v-if="store.household"
        class="invitation__blocked"
        role="note"
      >
        {{ t('household.invitation.blocked', { name: store.household.name }) }}
      </p>

      <div class="invitation__actions">
        <BaseButton
          :disabled="store.household !== null"
          :loading="busy"
          @click="accept"
        >
          {{ t('household.invitation.accept') }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          :loading="busy"
          @click="decline"
        >
          {{ t('household.invitation.decline') }}
        </BaseButton>
      </div>
    </template>

    <template v-else>
      <h1>{{ t('household.invitation.title') }}</h1>
      <ErrorNotice :error="store.error" />
      <p v-if="!account.session">
        {{ t('household.invitation.signInToAnswer') }}
      </p>
      <p v-else-if="!store.loaded && store.status !== 'error' && store.status !== 'unreachable'">
        {{ t('household.invitation.loading') }}
      </p>
      <p v-else>
        {{ t('household.invitation.gone') }}
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
