<script setup lang="ts">
/**
 * Foyer : le sien, ou les invitations reçues et la création d'un foyer.
 *
 * Le foyer n'existe qu'en ligne. Tout ce qui s'y montre vient de la dernière
 * réponse du serveur, qui fait autorité ; aucune action ne présume de son
 * résultat avant qu'il l'ait confirmée.
 *
 * Chaque partie a son composant : la journée des membres, l'invitation, les
 * gestes qui retirent quelqu'un ou défont le foyer (repliés en bas, à
 * l'écart), les invitations reçues. L'écran garde ce qui les relie : l'état
 * du compte et du serveur, et le message qui annonce qu'une action a réussi —
 * il doit survivre au passage d'un état à l'autre (« Foyer créé »).
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import HouseholdExit from '@/app/components/household/HouseholdExit.vue'
import HouseholdInvite from '@/app/components/household/HouseholdInvite.vue'
import HouseholdMembersToday from '@/app/components/household/HouseholdMembersToday.vue'
import HouseholdOffline from '@/app/components/household/HouseholdOffline.vue'
import HouseholdReceived from '@/app/components/household/HouseholdReceived.vue'
import { HOUSEHOLD_APP_LINK } from '@/contract/household'
import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '@/modules/household/application'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const router = useRouter()
const account = useAccountStore()
const store = useHousehold()

const name = ref('')
const message = ref('')

const household = computed(() => store.household)
const busy = computed(() => store.status === 'loading')

/** Lance une action du foyer, puis annonce sa réussite dans la région d'état. */
async function run(action: () => Promise<boolean>, success: string): Promise<void> {
  message.value = ''
  store.clearError()
  if (await action()) message.value = success
}

async function create(): Promise<void> {
  await run(() => store.create(name.value), t('household.created'))
  if (store.household !== null) name.value = ''
}

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
      <HouseholdOffline
        v-if="account.status === 'unreachable'"
        @retry="account.load()"
      />

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

      <HouseholdOffline
        v-if="store.status === 'unreachable'"
        @retry="store.load()"
      />

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
        <HouseholdMembersToday :household="household" />

        <HouseholdInvite
          v-if="store.isOwner"
          :household="household"
          :run="run"
        />

        <section
          v-if="store.invitations.length > 0"
          class="list-group"
          aria-labelledby="foyer-autres"
        >
          <h2
            id="foyer-autres"
            class="eyebrow list-group__title"
          >
            {{ t('household.otherInvitationsTitle') }}
          </h2>
          <p class="list-group__note">
            {{ t('household.otherInvitationsSubtitle') }}
          </p>
          <ul class="list-rows">
            <li
              v-for="invitation in store.invitations"
              :key="invitation.id"
            >
              <RouterLink
                class="list-row list-row--link"
                :to="{ name: ROUTE.invitation, params: { invitationId: invitation.id } }"
              >
                <span class="list-row__label">
                  {{ invitation.householdName }}
                  <span class="list-row__hint">{{ t('household.invitedBy', { name: invitation.invitedBy }) }}</span>
                </span>
                <AppIcon
                  name="chevron-right"
                  class="list-row__chevron"
                />
              </RouterLink>
            </li>
          </ul>
        </section>

        <HouseholdExit
          :household="household"
          :run="run"
        />
      </template>

      <template v-else>
        <p class="household__intro">
          {{ t('household.intro') }}
        </p>

        <HouseholdReceived :invitations="store.invitations" />

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

/* Un groupe : son titre (ou son intitulé discret), puis ce qu'il contient.
   Le motif est dans `styles/_list-rows.scss` ; ici, ses écarts. */
.list-group {
  gap: var(--space-3);
}

.list-group__title {
  margin-bottom: calc(-1 * var(--space-1));
}

/* Lignes : sur une seule rangée, le nom puis son détail en colonne. */
.list-row {
  flex-wrap: nowrap;
  gap: var(--space-3);
}

.list-row__label {
  display: flex;
  flex: 1;
  flex-direction: column;
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
