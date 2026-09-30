<script setup lang="ts">
/**
 * Foyer : le sien, ou les invitations reçues et la création d'un foyer.
 *
 * Le foyer n'existe qu'en ligne. Tout ce qui s'y montre vient de la dernière
 * réponse du serveur, qui fait autorité ; aucune action ne présume de son
 * résultat avant qu'il l'ait confirmée.
 */
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { HOUSEHOLD_APP_LINK } from '@/contract/household'
import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import type { HouseholdMemberView } from '@/modules/household/application'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '@/modules/household/application'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import RichText from '@/ui/RichText.vue'

import { formatDay } from './householdFormat'

const router = useRouter()
const account = useAccountStore()
const store = useHousehold()

const name = ref('')
const inviteEmail = ref('')
const message = ref('')

const household = computed(() => store.household)
const busy = computed(() => store.status === 'loading')
const myAccountId = computed(() => account.session?.accountId ?? null)

function memberNote(member: HouseholdMemberView): string {
  const notes = [
    // Le nom du profil s'affiche en titre ; l'adresse reste là pour lever un doute.
    member.name === null ? null : member.email,
    member.isOwner ? t('household.noteOwner') : null,
    member.accountId === myAccountId.value ? t('household.noteYou') : null,
    member.sharesDays ? null : t('household.noteHidden'),
  ].filter((note): note is string => note !== null)
  return notes.join(', ')
}

async function run(action: () => Promise<boolean>, success: string): Promise<void> {
  message.value = ''
  store.clearError()
  if (await action()) message.value = success
}

async function create(): Promise<void> {
  await run(() => store.create(name.value), t('household.created'))
  if (store.household !== null) name.value = ''
}

async function invite(): Promise<void> {
  const email = inviteEmail.value.trim()
  await run(() => store.invite(email), t('household.invited', { email }))
  if (store.error === null) inviteEmail.value = ''
}

const remove = (member: HouseholdMemberView) =>
  run(
    () => store.removeMember(member.accountId),
    t('household.removed', { name: member.name ?? member.email }),
  )

async function leave(): Promise<void> {
  await run(() => store.leave(), t('household.left'))
}

async function dissolve(): Promise<void> {
  await run(() => store.dissolve(), t('household.dissolved'))
}

const signInLink = { name: ROUTE.signIn, query: { suite: HOUSEHOLD_APP_LINK } }
</script>

<template>
  <div class="household">
    <h1>{{ t('household.title') }}</h1>

    <template v-if="!account.session">
      <BaseCard
        v-if="account.status === 'unreachable'"
        :title="t('household.unreachableTitle')"
      >
        <p class="household__text">
          {{ t('household.unreachableText') }}
        </p>
        <BaseButton
          variant="secondary"
          @click="account.load()"
        >
          {{ t('household.retry') }}
        </BaseButton>
      </BaseCard>

      <BaseCard
        v-else
        :title="t('household.needAccountTitle')"
        :subtitle="t('household.needAccountSubtitle')"
      >
        <div class="household__actions">
          <BaseButton @click="router.push(signInLink)">
            {{ t('household.signIn') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            @click="router.push({ name: ROUTE.signUp })"
          >
            {{ t('household.signUp') }}
          </BaseButton>
        </div>
      </BaseCard>
    </template>

    <template v-else>
      <ErrorNotice :error="store.error" />
      <p
        class="household__message"
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>

      <BaseCard
        v-if="store.status === 'unreachable'"
        :title="t('household.unreachableTitle')"
      >
        <p class="household__text">
          {{ t('household.unreachableText') }}
        </p>
        <BaseButton
          variant="secondary"
          @click="store.load()"
        >
          {{ t('household.retry') }}
        </BaseButton>
      </BaseCard>

      <template v-else-if="!store.loaded">
        <p
          v-if="store.status !== 'error'"
          class="household__text"
        >
          {{ t('household.loading') }}
        </p>
        <BaseButton
          v-else
          variant="secondary"
          @click="store.load()"
        >
          {{ t('household.retry') }}
        </BaseButton>
      </template>

      <template v-else-if="household">
        <BaseCard
          :title="household.name"
          :subtitle="household.role === 'owner' ? t('household.roleOwner') : t('household.roleMember')"
        >
          <h3 class="household__heading">
            {{ t('household.members', { n: household.members.length }) }}
          </h3>
          <ul class="household__list">
            <li
              v-for="member in household.members"
              :key="member.accountId"
              class="household__item"
            >
              <span class="household__who">
                <strong>{{ member.name ?? member.email }}</strong>
                <small>{{ memberNote(member) }}</small>
                <RouterLink
                  v-if="member.playerId && member.sharesDays && member.accountId !== myAccountId"
                  class="household__days"
                  :to="{ name: ROUTE.memberDay, params: { playerId: member.playerId } }"
                >
                  {{ t('household.viewDays') }}<span class="sr-only"> ({{ member.name ?? member.email }})</span>
                </RouterLink>
              </span>
              <ConfirmButton
                v-if="store.isOwner && !member.isOwner"
                size="sm"
                :question="t('household.removeQuestion', { name: member.name ?? member.email })"
                :confirm-label="t('household.remove')"
                @confirm="remove(member)"
              >
                {{ t('household.remove') }}
              </ConfirmButton>
            </li>
          </ul>

          <p class="household__note">
            <RichText :path="household.sharesDays ? 'household.sharesYes' : 'household.sharesNo'" />
            <RouterLink :to="{ name: ROUTE.settings }">
              {{ t('household.changeInSettings') }}
            </RouterLink>
          </p>
        </BaseCard>

        <BaseCard
          v-if="store.isOwner"
          :title="t('household.inviteTitle')"
          :subtitle="t('household.inviteSubtitle')"
        >
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
            <h3 class="household__heading">
              {{ t('household.pendingTitle') }}
            </h3>
            <ul class="household__list">
              <li
                v-for="invitation in household.invitations"
                :key="invitation.id"
                class="household__item"
              >
                <span class="household__who">
                  <strong>{{ invitation.email }}</strong>
                  <small>{{ t('household.validUntil', { date: formatDay(invitation.expiresAt) }) }}</small>
                </span>
                <ConfirmButton
                  size="sm"
                  :question="t('household.revokeQuestion', { email: invitation.email })"
                  :confirm-label="t('household.revoke')"
                  :cancel-label="t('household.keep')"
                  @confirm="run(() => store.revoke(invitation.id), t('household.revoked'))"
                >
                  {{ t('household.revoke') }}
                </ConfirmButton>
              </li>
            </ul>
          </template>
        </BaseCard>

        <BaseCard
          v-if="store.invitations.length > 0"
          :title="t('household.otherInvitationsTitle')"
          :subtitle="t('household.otherInvitationsSubtitle')"
        >
          <ul class="household__list">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
            >
              <RouterLink :to="{ name: ROUTE.invitation, params: { invitationId: invitation.id } }">
                {{ invitation.householdName }}
              </RouterLink>
              <small class="household__meta">{{ t('household.invitedBy', { name: invitation.invitedBy }) }}</small>
            </li>
          </ul>
        </BaseCard>

        <BaseCard
          v-if="store.isOwner"
          :title="t('household.dissolveTitle')"
        >
          <p class="household__text">
            {{ t('household.dissolveText') }}
          </p>
          <ConfirmButton
            :question="t('household.dissolveQuestion', { name: household.name })"
            :confirm-label="t('household.dissolve')"
            :loading="busy"
            @confirm="dissolve"
          >
            {{ t('household.dissolve') }}
          </ConfirmButton>
        </BaseCard>

        <BaseCard
          v-else
          :title="t('household.leaveTitle')"
        >
          <p class="household__text">
            {{ t('household.leaveText') }}
          </p>
          <ConfirmButton
            :question="t('household.leaveQuestion', { name: household.name })"
            :confirm-label="t('household.leaveConfirm')"
            :loading="busy"
            @confirm="leave"
          >
            {{ t('household.leave') }}
          </ConfirmButton>
        </BaseCard>
      </template>

      <template v-else>
        <BaseCard
          v-if="store.invitations.length > 0"
          :title="t('household.receivedTitle')"
        >
          <ul class="household__list">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
              class="household__item"
            >
              <span class="household__who">
                <strong>{{ invitation.householdName }}</strong>
                <small>{{ t('household.receivedFrom', { name: invitation.invitedBy, date: formatDay(invitation.expiresAt) }) }}</small>
              </span>
              <BaseButton
                size="sm"
                @click="router.push({ name: ROUTE.invitation, params: { invitationId: invitation.id } })"
              >
                {{ t('household.answer') }}
              </BaseButton>
            </li>
          </ul>
        </BaseCard>

        <BaseCard
          :title="t('household.createTitle')"
          :subtitle="t('household.createSubtitle')"
        >
          <p class="household__text">
            {{ t('household.createText') }}
          </p>
          <form
            class="household__form"
            novalidate
            @submit.prevent="create"
          >
            <BaseField
              v-model="name"
              :label="t('household.createName')"
              :hint="t('household.createHint', { max: HOUSEHOLD_NAME_MAX_LENGTH })"
              autocomplete="off"
              required
            />
            <BaseButton
              type="submit"
              :loading="busy"
            >
              {{ t('household.create') }}
            </BaseButton>
          </form>
        </BaseCard>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.household {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.household__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.household__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.household__heading {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}

.household__form + .household__heading {
  margin-top: var(--space-5);
}

.household__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.household__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.household__item:last-child {
  border-bottom: none;
}

.household__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: anywhere;
}

.household__who small,
.household__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.household__days {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  align-self: flex-start;
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
}

.household__text {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-sm);
}

.household__note {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.household__message {
  margin: 0;
  min-height: 1.25rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.household__message:empty {
  min-height: 0;
}
</style>
