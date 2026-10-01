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
import { initials } from '@/app/initials'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
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

/** Ce que les autres verront, puis ce qui reste privé : la liste fait le consentement. */
const seen = [
  'household.invitation.seen1',
  'household.invitation.seen2',
  'household.invitation.seen6',
  'household.invitation.seen3',
  'household.invitation.seen4',
  'household.invitation.seen5',
] as const

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
    <header class="invitation__bar">
      <RouterLink
        class="invitation__back"
        :to="{ name: ROUTE.household }"
      >
        <AppIcon name="chevron-left" />
        <span class="sr-only">{{ t('household.invitation.back') }}</span>
      </RouterLink>
      <p class="eyebrow invitation__eyebrow">
        {{ t('household.invitation.title') }}
      </p>
    </header>

    <template v-if="invitation">
      <!-- Celui qui invite, et la place qui vous attend. -->
      <div
        class="invitation__avatars"
        aria-hidden="true"
      >
        <span class="invitation__avatar">{{ initials(invitation.invitedBy) }}</span>
        <span class="invitation__avatar invitation__avatar--you">
          <AppIcon name="plus" />
        </span>
      </div>

      <div class="invitation__intro">
        <h1>{{ t('household.invitation.join', { name: invitation.householdName }) }}</h1>
        <p class="invitation__from">
          <RichText
            path="household.invitation.from"
            :params="{ name: invitation.invitedBy, date: formatDay(invitation.expiresAt) }"
          />
        </p>
        <p class="invitation__lead">
          {{ t('household.invitation.intro') }}
        </p>
      </div>

      <ErrorNotice :error="store.error" />

      <section
        class="points points--seen"
        aria-labelledby="invitation-vu"
      >
        <h2
          id="invitation-vu"
          class="points__title"
        >
          {{ t('household.invitation.seenTitle') }}
        </h2>
        <ul class="points__list">
          <li
            v-for="key in seen"
            :key="key"
            class="points__item"
          >
            <span
              class="points__mark"
              aria-hidden="true"
            ><AppIcon name="check" /></span>
            {{ t(key) }}
          </li>
        </ul>
        <p class="points__note">
          {{ t('household.invitation.seenNote') }}
        </p>
      </section>

      <section
        class="points points--private"
        aria-labelledby="invitation-prive"
      >
        <h2
          id="invitation-prive"
          class="points__title"
        >
          {{ t('household.invitation.privateTitle') }}
        </h2>
        <ul class="points__list">
          <li class="points__item">
            <span
              class="points__mark"
              aria-hidden="true"
            ><AppIcon name="lock" /></span>
            {{ t('household.invitation.private1') }}
          </li>
        </ul>
      </section>

      <p class="invitation__note">
        {{ t('household.invitation.privateNote') }}
      </p>

      <p
        v-if="store.household"
        class="invitation__blocked"
        role="note"
      >
        {{ t('household.invitation.blocked', { name: store.household.name }) }}
      </p>

      <!-- Pas collés en bas de l'écran : on lit ce qui sera partagé avant
           d'arriver aux boutons. -->
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
      <p
        v-if="!account.session"
        class="invitation__lead"
      >
        {{ t('household.invitation.signInToAnswer') }}
      </p>
      <p
        v-else-if="!store.loaded && store.status !== 'error' && store.status !== 'unreachable'"
        class="invitation__lead"
      >
        {{ t('household.invitation.loading') }}
      </p>
      <p
        v-else
        class="invitation__lead"
      >
        {{ t('household.invitation.gone') }}
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.invitation {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);

  h1 {
    margin: 0;
    overflow-wrap: break-word;
  }
}

.invitation__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.invitation__back {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-left: calc(-1 * var(--space-3));
  border-radius: 50%;
  color: var(--color-text);

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
}

.invitation__eyebrow {
  margin: 0;
}

/* Deux pastilles qui se chevauchent : l'hôte, puis la place à prendre. */
.invitation__avatars {
  display: flex;
}

.invitation__avatar {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border: 3px solid var(--color-bg);
  border-radius: 50%;
  background: var(--color-saffron);
  color: var(--color-on-saffron);
  font-weight: 700;
}

.invitation__avatar--you {
  margin-left: calc(-1 * var(--space-3));
  border: 2px dashed var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
}

.invitation__intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.invitation__from {
  margin: 0;
  overflow-wrap: anywhere;
}

.invitation__lead {
  margin: 0;
  color: var(--color-text-muted);
}

/* Les deux listes : ce qui se verra sur une carte, ce qui reste privé en
   retrait. Chaque point a sa marque, coche ou cadenas, et son titre le dit
   aussi en toutes lettres (critère 1.4.1). */
.points {
  padding: var(--card-padding);
  border-radius: var(--radius-lg);
}

.points--seen {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
}

.points--private {
  background: var(--color-surface);
}

.points__title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  font-weight: 700;
}

.points__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.points__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.points__mark {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  font-size: 0.875rem;
}

.points--seen .points__mark {
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.points--private .points__mark {
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.points__note {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.invitation__note {
  margin: calc(-1 * var(--space-2)) var(--space-1) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.invitation__blocked {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-md);
}

.invitation__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
