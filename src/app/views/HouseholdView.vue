<script setup lang="ts">
/**
 * Foyer : le sien, ou les invitations reçues et la création d'un foyer.
 *
 * Le foyer n'existe qu'en ligne. Tout ce qui s'y montre vient de la dernière
 * réponse du serveur, qui fait autorité ; aucune action ne présume de son
 * résultat avant qu'il l'ait confirmée.
 *
 * Chaque membre a sa ligne : ce qu'il a mangé aujourd'hui sur son besoin, s'il
 * partage ses journées, et le lien vers sa journée. Les gestes qui retirent
 * quelqu'un ou défont le foyer sont repliés en bas, à l'écart.
 */
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { HOUSEHOLD_APP_LINK } from '@/contract/household'
import { useTodayStore } from '@/app/day/useTodayStore'
import { useMembersToday } from '@/app/household/useMembersToday'
import { initials } from '@/app/initials'
import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { numberFormat, t } from '@/i18n'
import type { HouseholdMemberView } from '@/modules/household/application'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '@/modules/household/application'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MeterBar from '@/ui/MeterBar.vue'
import RichText from '@/ui/RichText.vue'

import { formatDay } from './householdFormat'

const router = useRouter()
const account = useAccountStore()
const store = useHousehold()
const clock = useTodayStore()

const name = ref('')
const inviteEmail = ref('')
const message = ref('')

const household = computed(() => store.household)
const busy = computed(() => store.status === 'loading')
const myAccountId = computed(() => account.session?.accountId ?? null)

const eaten = useMembersToday(
  () => store.household,
  () => myAccountId.value,
  () => clock.today,
)

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)
const nameOf = (member: HouseholdMemberView): string => member.name ?? member.email

/** Ce qu'une ligne de membre affiche ; une fonction plutôt qu'un gabarit à embranchements. */
interface MemberRow {
  readonly member: HouseholdMemberView
  readonly mine: boolean
  readonly label: string
  readonly avatar: string
  /** `self` : pastille Encre ; `shared` : safran ; `hidden` : en retrait. */
  readonly tone: 'self' | 'shared' | 'hidden'
  readonly link: { name: string; params?: Record<string, string> } | null
  readonly eaten: number | null
  readonly target: number | null
  /** Phrase à la place des chiffres : journée cachée, pas encore de profil. */
  readonly note: string | null
}

function rowOf(member: HouseholdMemberView): MemberRow {
  const mine = member.accountId === myAccountId.value
  const visible = member.playerId !== null && (mine || member.sharesDays)
  return {
    member,
    mine,
    label: mine ? t('household.you') : nameOf(member),
    avatar: initials(member.name ?? member.email),
    tone: mine ? 'self' : member.sharesDays ? 'shared' : 'hidden',
    link: !visible
      ? null
      : mine
        ? { name: ROUTE.dashboard }
        : { name: ROUTE.memberDay, params: { playerId: member.playerId! } },
    eaten: visible ? (eaten.value.get(member.playerId!) ?? null) : null,
    target: member.targetCalories,
    note: member.playerId === null
      ? t('household.noProfile')
      : !visible
        ? t('household.notShared')
        : null,
  }
}

const rows = computed(() => household.value?.members.map(rowOf) ?? [])
const removable = computed(() =>
  store.isOwner ? (household.value?.members.filter((member) => !member.isOwner) ?? []) : [],
)

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
  run(() => store.removeMember(member.accountId), t('household.removed', { name: nameOf(member) }))

const leave = () => run(() => store.leave(), t('household.left'))
const dissolve = () => run(() => store.dissolve(), t('household.dissolved'))

const signInLink = { name: ROUTE.signIn, query: { suite: HOUSEHOLD_APP_LINK } }
</script>

<template>
  <div class="household">
    <header class="household__header">
      <p
        v-if="household"
        class="household__eyebrow"
      >
        {{ t('household.eyebrow', { name: household.name, n: household.members.length }) }}
      </p>
      <h1>{{ t('household.title') }}</h1>
    </header>

    <template v-if="!account.session">
      <div
        v-if="account.status === 'unreachable'"
        class="offline"
      >
        <AppIcon
          name="offline"
          class="offline__icon"
        />
        <div class="offline__text">
          <h2 class="offline__title">
            {{ t('household.unreachableTitle') }}
          </h2>
          <p>{{ t('household.unreachableText') }}</p>
          <BaseButton
            variant="secondary"
            size="sm"
            @click="account.load()"
          >
            {{ t('household.retry') }}
          </BaseButton>
        </div>
      </div>

      <section
        v-else
        class="panel"
        aria-labelledby="sans-compte"
      >
        <h2
          id="sans-compte"
          class="panel__title"
        >
          {{ t('household.needAccountTitle') }}
        </h2>
        <p class="panel__text">
          {{ t('household.needAccountSubtitle') }}
        </p>
        <div class="panel__actions">
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
      </section>
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

      <div
        v-if="store.status === 'unreachable'"
        class="offline"
      >
        <AppIcon
          name="offline"
          class="offline__icon"
        />
        <div class="offline__text">
          <h2 class="offline__title">
            {{ t('household.unreachableTitle') }}
          </h2>
          <p>{{ t('household.unreachableText') }}</p>
          <BaseButton
            variant="secondary"
            size="sm"
            @click="store.load()"
          >
            {{ t('household.retry') }}
          </BaseButton>
        </div>
      </div>

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
        <section
          class="group"
          aria-labelledby="foyer-aujourdhui"
        >
          <h2
            id="foyer-aujourdhui"
            class="group__heading"
          >
            {{ t('household.todayTitle') }}
          </h2>
          <ul class="members">
            <li
              v-for="row in rows"
              :key="row.member.accountId"
            >
              <component
                :is="row.link ? RouterLink : 'div'"
                v-bind="row.link ? { to: row.link } : {}"
                class="member"
                :class="{ 'member--link': row.link }"
              >
                <span
                  class="member__avatar"
                  :class="`member__avatar--${row.tone}`"
                  aria-hidden="true"
                >{{ row.avatar }}</span>
                <span class="member__body">
                  <span class="member__top">
                    <span class="member__name">
                      {{ row.label }}<span
                        v-if="row.member.isOwner"
                        class="member__tag"
                      ><span class="sr-only">, </span>{{ t('household.ownerTag') }}</span>
                    </span>
                    <span
                      v-if="row.eaten !== null && row.target !== null"
                      class="member__figures"
                    >
                      <span aria-hidden="true"><strong>{{ kcal(row.eaten) }}</strong> / {{ kcal(row.target) }} kcal</span>
                      <span class="sr-only">, {{ t('household.eatenSpoken', { eaten: kcal(row.eaten), target: kcal(row.target) }) }}</span>
                    </span>
                    <span
                      v-else-if="row.eaten !== null"
                      class="member__figures"
                    >
                      <span class="sr-only">, </span>{{ t('household.eatenOnly', { eaten: kcal(row.eaten) }) }}
                    </span>
                  </span>
                  <MeterBar
                    v-if="row.eaten !== null && row.target !== null"
                    class="member__meter"
                    :value="row.eaten"
                    :target="row.target"
                  />
                  <span
                    v-if="row.note"
                    class="member__note"
                  ><span class="sr-only">, </span>{{ row.note }}</span>
                </span>
                <AppIcon
                  v-if="row.link"
                  name="chevron-right"
                  class="member__end"
                />
                <AppIcon
                  v-else-if="row.member.playerId !== null"
                  name="lock"
                  class="member__end"
                />
              </component>
            </li>
          </ul>
          <p class="group__note">
            {{ household.role === 'owner' ? t('household.roleOwner') : t('household.roleMember') }}
            {{ ' ' }}<RichText :path="household.sharesDays ? 'household.sharesYes' : 'household.sharesNo'" />
            {{ ' ' }}<RouterLink :to="{ name: ROUTE.settings }">
              {{ t('household.changeInSettings') }}
            </RouterLink>
          </p>
        </section>

        <section
          v-if="store.isOwner"
          class="group"
          aria-labelledby="foyer-inviter"
        >
          <h2
            id="foyer-inviter"
            class="group__heading"
          >
            {{ t('household.inviteTitle') }}
          </h2>
          <p class="group__note">
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
            <h3 class="eyebrow group__subheading">
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
                <ConfirmButton
                  size="sm"
                  :question="t('household.revokeQuestion', { email: invitation.email })"
                  :confirm-label="t('household.revoke')"
                  :cancel-label="t('household.keep')"
                  @confirm="run(() => store.revoke(invitation.id), t('household.revoked'))"
                >
                  {{ t('household.revokeShort') }}<span class="sr-only">{{ t('household.revokeSpoken', { email: invitation.email }) }}</span>
                </ConfirmButton>
              </li>
            </ul>
          </template>
        </section>

        <section
          v-if="store.invitations.length > 0"
          class="group"
          aria-labelledby="foyer-autres"
        >
          <h2
            id="foyer-autres"
            class="eyebrow group__title"
          >
            {{ t('household.otherInvitationsTitle') }}
          </h2>
          <p class="group__note">
            {{ t('household.otherInvitationsSubtitle') }}
          </p>
          <ul class="rows">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
            >
              <RouterLink
                class="row row--link"
                :to="{ name: ROUTE.invitation, params: { invitationId: invitation.id } }"
              >
                <span class="row__label">
                  {{ invitation.householdName }}
                  <span class="row__hint">{{ t('household.invitedBy', { name: invitation.invitedBy }) }}</span>
                </span>
                <AppIcon
                  name="chevron-right"
                  class="row__chevron"
                />
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          class="group"
          aria-labelledby="foyer-quitter"
        >
          <h2
            id="foyer-quitter"
            class="eyebrow group__title"
          >
            {{ t('household.exitTitle') }}
          </h2>
          <ul class="rows">
            <li v-if="removable.length > 0">
              <details class="danger">
                <summary class="row row--link danger__summary">
                  <span class="row__label">{{ t('household.removeTitle') }}</span>
                  <AppIcon
                    name="chevron-down"
                    class="row__chevron danger__chevron"
                  />
                </summary>
                <ul class="danger__members">
                  <li
                    v-for="member in removable"
                    :key="member.accountId"
                    class="danger__member"
                  >
                    <span class="danger__name">
                      {{ nameOf(member) }}
                      <span
                        v-if="member.name !== null"
                        class="danger__email"
                      >{{ member.email }}</span>
                    </span>
                    <ConfirmButton
                      size="sm"
                      :question="t('household.removeQuestion', { name: nameOf(member) })"
                      :confirm-label="t('household.remove')"
                      @confirm="remove(member)"
                    >
                      {{ t('household.remove') }}
                    </ConfirmButton>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <details class="danger">
                <summary class="row row--link danger__summary">
                  <span class="row__label">
                    {{ store.isOwner ? t('household.dissolveTitle') : t('household.leaveTitle') }}
                  </span>
                  <AppIcon
                    name="chevron-down"
                    class="row__chevron danger__chevron"
                  />
                </summary>
                <div class="danger__body">
                  <p class="row__hint">
                    {{ store.isOwner ? t('household.dissolveText') : t('household.leaveText') }}
                  </p>
                  <ConfirmButton
                    v-if="store.isOwner"
                    :question="t('household.dissolveQuestion', { name: household.name })"
                    :confirm-label="t('household.dissolve')"
                    :loading="busy"
                    @confirm="dissolve"
                  >
                    {{ t('household.dissolve') }}
                  </ConfirmButton>
                  <ConfirmButton
                    v-else
                    :question="t('household.leaveQuestion', { name: household.name })"
                    :confirm-label="t('household.leaveConfirm')"
                    :loading="busy"
                    @confirm="leave"
                  >
                    {{ t('household.leave') }}
                  </ConfirmButton>
                </div>
              </details>
            </li>
          </ul>
        </section>
      </template>

      <template v-else>
        <p class="household__intro">
          {{ t('household.intro') }}
        </p>

        <ul
          v-if="store.invitations.length > 0"
          class="received"
        >
          <li
            v-for="invitation in store.invitations"
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

        <p
          v-if="store.invitations.length > 0"
          class="or"
        >
          <span>{{ t('household.or') }}</span>
        </p>

        <section
          class="panel"
          aria-labelledby="creer-foyer"
        >
          <div class="panel__head">
            <span
              class="panel__icon"
              aria-hidden="true"
            >
              <AppIcon name="household" />
            </span>
            <h2
              id="creer-foyer"
              class="panel__title"
            >
              {{ t('household.createTitle') }}
            </h2>
          </div>
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
          <p class="panel__note">
            {{ t('household.createAfter') }}
          </p>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.household {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);

  h1 {
    margin: 0;
  }
}

/* Le message de réussite et l'erreur se collent à l'en-tête : sans eux,
   l'espace entre deux blocs suffit. */
.household__message {
  margin: calc(-1 * var(--space-4)) 0 0;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 700;

  &:empty {
    display: none;
  }
}

.household__eyebrow {
  margin: 0 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  overflow-wrap: break-word;
}

.household__intro,
.household__text {
  margin: 0;
}

.household__intro {
  margin-top: calc(-1 * var(--space-3));
}

.household__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Un groupe : son titre (ou son intitulé discret), puis ce qu'il contient. */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.group__heading {
  margin: 0;
}

.group__title {
  margin: 0 0 calc(-1 * var(--space-1)) var(--space-1);
}

.group__subheading {
  margin: var(--space-3) 0 0 var(--space-1);
}

.group__note {
  margin: 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Les membres : une carte, une ligne chacun. */
.members {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;

  > li + li {
    border-top: 1px solid var(--color-divider);
  }
}

.member {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 4.5rem;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;
}

.member--link {
  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.member__avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.member__avatar--self {
  background: var(--color-inverse);
  color: var(--color-on-inverse);
}

.member__avatar--shared {
  background: var(--color-saffron);
  color: var(--color-on-saffron);
}

.member__avatar--hidden {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.member__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.member__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 var(--space-3);
}

.member__name {
  min-width: 0;
  font-weight: 700;
  overflow-wrap: break-word;
}

.member__tag {
  display: inline-block;
  margin-left: var(--space-2);
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 400;
}

.member__figures {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  strong {
    color: var(--color-text);
  }
}

.member__note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.member__end {
  flex-shrink: 0;
  color: var(--color-text-muted);
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

.pending__date {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Lignes repliables, comme dans les réglages. */
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;

  > li + li {
    border-top: 1px solid var(--color-divider);
  }
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 3.5rem;
  padding: var(--space-2) var(--space-4);
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;
}

.row--link {
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.row__label {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: break-word;
}

.row__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.row__chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.danger__summary {
  list-style: none;
  color: var(--color-danger);
  font-weight: 700;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover {
    color: var(--color-danger);
  }
}

.danger__chevron {
  transition: transform var(--duration-fast) var(--ease-out);
}

.danger[open] .danger__chevron {
  transform: rotate(180deg);
}

.danger__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}

.danger__members {
  margin: 0;
  padding: 0 var(--space-4) var(--space-2);
  list-style: none;
}

.danger__member {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0;

  & + & {
    border-top: 1px solid var(--color-divider);
  }
}

.danger__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: break-word;
}

/* L'adresse lève le doute entre deux prénoms identiques, avant de retirer. */
.danger__email {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

/* Hors ligne : un bloc discontinu, le pictogramme et le mot. */
.offline {
  display: flex;
  gap: var(--space-3);
  padding: var(--card-padding);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}

.offline__icon {
  flex-shrink: 0;
  margin-top: 0.2em;
  color: var(--color-text-muted);
}

.offline__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }
}

.offline__title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  font-weight: 700;
}

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

/* Un bloc clair : sans compte, ou pour créer un foyer. */
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.panel__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.panel__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.panel__title {
  margin: 0;
  font-size: var(--font-size-xl);
  overflow-wrap: break-word;
}

.panel__text,
.panel__note {
  margin: 0;
}

.panel__note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
