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
import type { HouseholdMemberView } from '@/modules/household/application'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '@/modules/household/application'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

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
    member.isOwner ? 'propriétaire' : null,
    member.accountId === myAccountId.value ? 'vous' : null,
    member.sharesDays ? null : 'ne partage pas ses journées',
  ].filter((note): note is string => note !== null)
  return notes.join(' · ')
}

async function run(action: () => Promise<boolean>, success: string): Promise<void> {
  message.value = ''
  store.clearError()
  if (await action()) message.value = success
}

async function create(): Promise<void> {
  await run(() => store.create(name.value), 'Foyer créé. Invitez-y qui vous voulez.')
  if (store.household !== null) name.value = ''
}

async function invite(): Promise<void> {
  const email = inviteEmail.value.trim()
  await run(() => store.invite(email), `Invitation envoyée à ${email}.`)
  if (store.error === null) inviteEmail.value = ''
}

const remove = (member: HouseholdMemberView) =>
  run(() => store.removeMember(member.accountId), `${member.email} ne fait plus partie du foyer.`)

async function leave(): Promise<void> {
  await run(() => store.leave(), 'Vous avez quitté le foyer.')
}

async function dissolve(): Promise<void> {
  await run(() => store.dissolve(), 'Foyer dissous.')
}

const signInLink = { name: ROUTE.signIn, query: { suite: HOUSEHOLD_APP_LINK } }
</script>

<template>
  <div class="household">
    <h1>Foyer</h1>

    <template v-if="!account.session">
      <BaseCard
        v-if="account.status === 'unreachable'"
        title="Serveur injoignable"
      >
        <p class="household__text">
          Le foyer se consulte en ligne, et le serveur ne répond pas pour l’instant.
        </p>
        <BaseButton
          variant="secondary"
          @click="account.load()"
        >
          Réessayer
        </BaseButton>
      </BaseCard>

      <BaseCard
        v-else
        title="Un foyer demande un compte"
        subtitle="Vous avez reçu une invitation ? Connectez-vous avec l’adresse qui l’a reçue."
      >
        <div class="household__actions">
          <BaseButton @click="router.push(signInLink)">
            Se connecter
          </BaseButton>
          <BaseButton
            variant="secondary"
            @click="router.push({ name: ROUTE.signUp })"
          >
            Créer un compte
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
        title="Serveur injoignable"
      >
        <p class="household__text">
          Le foyer se consulte en ligne, et le serveur ne répond pas pour l’instant.
        </p>
        <BaseButton
          variant="secondary"
          @click="store.load()"
        >
          Réessayer
        </BaseButton>
      </BaseCard>

      <template v-else-if="!store.loaded">
        <p
          v-if="store.status !== 'error'"
          class="household__text"
        >
          Chargement du foyer…
        </p>
        <BaseButton
          v-else
          variant="secondary"
          @click="store.load()"
        >
          Réessayer
        </BaseButton>
      </template>

      <template v-else-if="household">
        <BaseCard
          :title="household.name"
          :subtitle="household.role === 'owner' ? 'Vous en êtes le propriétaire.' : 'Vous en êtes membre.'"
        >
          <h3 class="household__heading">
            Membres ({{ household.members.length }})
          </h3>
          <ul class="household__list">
            <li
              v-for="member in household.members"
              :key="member.accountId"
              class="household__item"
            >
              <span class="household__who">
                <strong>{{ member.email }}</strong>
                <small>{{ memberNote(member) }}</small>
              </span>
              <ConfirmButton
                v-if="store.isOwner && !member.isOwner"
                size="sm"
                :question="`Retirer ${member.email} du foyer ?`"
                confirm-label="Retirer"
                @confirm="remove(member)"
              >
                Retirer
              </ConfirmButton>
            </li>
          </ul>

          <p class="household__note">
            Vos journées sont
            <strong>{{ household.sharesDays ? 'partagées' : 'privées' }}</strong>.
            <RouterLink :to="{ name: ROUTE.settings }">
              Modifier dans les réglages
            </RouterLink>
          </p>
        </BaseCard>

        <BaseCard
          v-if="store.isOwner"
          title="Inviter"
          subtitle="La personne reçoit un e-mail, et rejoint le foyer si elle accepte."
        >
          <form
            class="household__form"
            novalidate
            @submit.prevent="invite"
          >
            <BaseField
              v-model="inviteEmail"
              label="Adresse e-mail"
              type="email"
              autocomplete="off"
              required
              verbatim
            />
            <BaseButton
              type="submit"
              :loading="busy"
            >
              Envoyer l’invitation
            </BaseButton>
          </form>

          <template v-if="household.invitations.length > 0">
            <h3 class="household__heading">
              En attente de réponse
            </h3>
            <ul class="household__list">
              <li
                v-for="invitation in household.invitations"
                :key="invitation.id"
                class="household__item"
              >
                <span class="household__who">
                  <strong>{{ invitation.email }}</strong>
                  <small>jusqu’au {{ formatDay(invitation.expiresAt) }}</small>
                </span>
                <ConfirmButton
                  size="sm"
                  :question="`Annuler l’invitation de ${invitation.email} ?`"
                  confirm-label="Annuler l’invitation"
                  cancel-label="La garder"
                  @confirm="run(() => store.revoke(invitation.id), 'Invitation annulée.')"
                >
                  Révoquer
                </ConfirmButton>
              </li>
            </ul>
          </template>
        </BaseCard>

        <BaseCard
          v-if="store.invitations.length > 0"
          title="Autres invitations"
          subtitle="Un compte n’appartient qu’à un foyer : pour en rejoindre un autre, quittez d’abord celui-ci."
        >
          <ul class="household__list">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
            >
              <RouterLink :to="{ name: ROUTE.invitation, params: { invitationId: invitation.id } }">
                {{ invitation.householdName }}
              </RouterLink>
              <small class="household__meta"> — de {{ invitation.invitedBy }}</small>
            </li>
          </ul>
        </BaseCard>

        <BaseCard
          v-if="store.isOwner"
          title="Dissoudre le foyer"
        >
          <p class="household__text">
            Chaque membre redevient seul, et les invitations en attente sont annulées. Les repas
            et les profils de chacun ne sont pas touchés.
          </p>
          <ConfirmButton
            :question="`Dissoudre « ${household.name} » pour tous ses membres ?`"
            confirm-label="Dissoudre"
            :loading="busy"
            @confirm="dissolve"
          >
            Dissoudre le foyer
          </ConfirmButton>
        </BaseCard>

        <BaseCard
          v-else
          title="Quitter le foyer"
        >
          <p class="household__text">
            Les autres membres ne verront plus vos journées. Pour revenir, il faudra une nouvelle
            invitation.
          </p>
          <ConfirmButton
            :question="`Quitter « ${household.name} » ?`"
            confirm-label="Quitter"
            :loading="busy"
            @confirm="leave"
          >
            Quitter le foyer
          </ConfirmButton>
        </BaseCard>
      </template>

      <template v-else>
        <BaseCard
          v-if="store.invitations.length > 0"
          title="Invitations reçues"
        >
          <ul class="household__list">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
              class="household__item"
            >
              <span class="household__who">
                <strong>{{ invitation.householdName }}</strong>
                <small>de {{ invitation.invitedBy }}, jusqu’au {{ formatDay(invitation.expiresAt) }}</small>
              </span>
              <BaseButton
                size="sm"
                @click="router.push({ name: ROUTE.invitation, params: { invitationId: invitation.id } })"
              >
                Répondre
              </BaseButton>
            </li>
          </ul>
        </BaseCard>

        <BaseCard
          title="Créer un foyer"
          subtitle="Vous en serez le propriétaire : vous seul y inviterez et en retirerez des membres."
        >
          <p class="household__text">
            Dans un foyer, chacun voit les repas et les jauges des autres, et peut prévoir un repas
            pour plusieurs. Les mensurations restent privées.
          </p>
          <form
            class="household__form"
            novalidate
            @submit.prevent="create"
          >
            <BaseField
              v-model="name"
              label="Nom du foyer"
              :hint="`Par exemple « Les Martin ». ${HOUSEHOLD_NAME_MAX_LENGTH} caractères au plus.`"
              autocomplete="off"
              required
            />
            <BaseButton
              type="submit"
              :loading="busy"
            >
              Créer le foyer
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
