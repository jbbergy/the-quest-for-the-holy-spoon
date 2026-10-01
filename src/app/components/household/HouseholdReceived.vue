<script setup lang="ts">
/**
 * Invitations reçues, quand on n'a pas encore de foyer : une carte chacune,
 * qui mène à l'invitation, puis « ou » avant de créer le sien.
 */
import { formatDay } from '@/app/household/householdFormat'
import { initials } from '@/app/initials'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import type { ReceivedInvitationView } from '@/modules/household/application'

defineProps<{ invitations: readonly ReceivedInvitationView[] }>()
</script>

<template>
  <template v-if="invitations.length > 0">
    <ul class="received">
      <li
        v-for="invitation in invitations"
        :key="invitation.id"
        class="received__card"
      >
        <div class="received__head">
          <span
            class="received__avatar"
            aria-hidden="true"
          >{{ initials(invitation.invitedBy) }}</span>
          <div class="received__text">
            <p class="received__eyebrow">
              {{ t('household.receivedEyebrow') }}
            </p>
            <h2 class="received__title">
              {{ t('household.receivedName', { household: invitation.householdName }) }}
            </h2>
            <p class="received__from">
              {{ t('household.receivedFrom', { name: invitation.invitedBy }) }}
            </p>
            <p class="received__date">
              {{ t('household.receivedValid', { date: formatDay(invitation.expiresAt) }) }}
            </p>
          </div>
        </div>
        <RouterLink
          class="received__open"
          :to="{ name: ROUTE.invitation, params: { invitationId: invitation.id } }"
        >
          {{ t('household.see') }}<span class="sr-only">{{ t('household.seeSpoken', { household: invitation.householdName }) }}</span>
        </RouterLink>
      </li>
    </ul>

    <p class="or">
      <span>{{ t('household.or') }}</span>
    </p>
  </template>
</template>

<style scoped lang="scss">
/* Invitations reçues : une carte foncée chacune. */
.received {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.received__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--card-padding);
  background: var(--color-inverse);
  border-radius: var(--radius-xl);
  color: var(--color-on-inverse);
}

.received__head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.received__avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--color-saffron);
  color: var(--color-on-saffron);
  font-weight: 700;
}

.received__text {
  min-width: 0;

  p {
    margin: 0;
  }
}

.received__eyebrow {
  color: var(--color-on-inverse-muted);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.received__title {
  margin: var(--space-1) 0;
  color: var(--color-on-inverse);
  font-size: var(--font-size-lg);
  overflow-wrap: break-word;
}

.received__from {
  overflow-wrap: anywhere;
}

.received__date {
  color: var(--color-on-inverse-muted);
  font-size: var(--font-size-sm);
}

.received__open {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-pill);
  background: var(--color-on-inverse);
  color: var(--color-inverse);
  font-weight: 700;
  text-align: center;
  text-decoration: none;

  &:hover {
    background: var(--color-on-inverse-muted);
    color: var(--color-inverse);
  }

  &:focus-visible {
    outline-color: var(--color-on-inverse);
  }
}

/* « ou », entre deux filets. */
.or {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: calc(-1 * var(--space-2)) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);

  &::before,
  &::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--color-border);
  }
}
</style>
