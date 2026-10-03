<script setup lang="ts">
/**
 * Inviter quelqu'un, et les invitations envoyées qui attendent une réponse.
 * Réservé à la personne qui a créé le foyer.
 */
import { computed, ref } from 'vue'

import { formatDay } from '@/app/household/householdFormat'
import { useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import type { HouseholdView } from '@/modules/household/application'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'

const props = defineProps<{
  household: HouseholdView
  /** Lance une action du foyer et annonce sa réussite, dans l'écran parent. */
  run: (action: () => Promise<boolean>, success: string) => Promise<void>
}>()

const store = useHousehold()
const busy = computed(() => store.status === 'loading')
const inviteEmail = ref('')

async function invite(): Promise<void> {
  const email = inviteEmail.value.trim()
  await props.run(() => store.invite(email), t('household.invited', { email }))
  if (store.error === null) inviteEmail.value = ''
}
</script>

<template>
  <section
    class="list-group"
    aria-labelledby="foyer-inviter"
  >
    <h2
      id="foyer-inviter"
      class="list-group__heading"
    >
      {{ t('household.inviteTitle') }}
    </h2>
    <p class="list-group__note">
      {{ t('household.inviteSubtitle') }}
    </p>
    <form
      class="household__form"
      novalidate
      @submit.prevent="invite"
    >
      <BaseField
        v-model="inviteEmail"
        :label="t('household.inviteEmail')"
        type="email"
        autocomplete="off"
        required
        verbatim
      />
      <BaseButton
        type="submit"
        :loading="busy"
      >
        {{ t('household.inviteSend') }}
      </BaseButton>
    </form>

    <template v-if="household.invitations.length > 0">
      <h3 class="eyebrow list-group__subheading">
        {{ t('household.pendingTitle') }}
      </h3>
      <ul class="pending">
        <li
          v-for="invitation in household.invitations"
          :key="invitation.id"
          class="pending__item"
        >
          <span class="pending__text">
            <span class="pending__email">{{ invitation.email }}</span>
            <span class="pending__date">{{ t('household.validUntil', { date: formatDay(invitation.expiresAt) }) }}</span>
          </span>
          <span class="pending__actions">
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="busy"
              @click="run(() => store.resend(invitation.id), t('household.resent', { email: invitation.email }))"
            >
              {{ t('household.resendShort') }}<span class="sr-only">{{ t('household.resendSpoken', { email: invitation.email }) }}</span>
            </BaseButton>
            <ConfirmButton
              size="sm"
              :question="t('household.revokeQuestion', { email: invitation.email })"
              :confirm-label="t('household.revoke')"
              :cancel-label="t('household.keep')"
              @confirm="run(() => store.revoke(invitation.id), t('household.revoked'))"
            >
              {{ t('household.revokeShort') }}<span class="sr-only">{{ t('household.revokeSpoken', { email: invitation.email }) }}</span>
            </ConfirmButton>
          </span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped lang="scss">
/* Un groupe (`styles/_list-rows.scss`) : ici plus aéré, titre compris. */
.list-group {
  gap: var(--space-3);
}

.list-group__heading {
  margin: 0;
}

.household__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.list-group__subheading {
  margin: var(--space-3) 0 0 var(--space-1);
}

/* Invitations en attente : un trait discontinu, comme tout ce qui n'est pas
   encore fait — et le mot « En attente » au-dessus. */
.pending {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
}

.pending__text {
  display: flex;
  flex: 1 1 10rem;
  flex-direction: column;
  min-width: 0;
}

.pending__email {
  overflow-wrap: break-word;
}

.pending__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pending__date {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
