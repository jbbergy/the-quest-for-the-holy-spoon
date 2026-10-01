<script setup lang="ts">
/**
 * Réglages du compte et des données : exporter ses données, se connecter ou
 * créer un compte, se déconnecter, supprimer son compte.
 *
 * La déconnexion attend une confirmation quand des modifications n'ont pas pu
 * partir : elles seraient perdues avec la copie locale du compte.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { GLOSSARY } from '@/app/glossary'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useDataExport } from '@/app/useDataExport'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import InfoTip from '@/ui/InfoTip.vue'
import PasswordField from '@/ui/PasswordField.vue'
import RichText from '@/ui/RichText.vue'

const router = useRouter()
const players = usePlayerStore()
const account = useAccountStore()
const dataExport = useDataExport()
const accountSync = useAccountSync()

const accountMessage = ref('')
const deletePassword = ref('')
/** Modifications qui n'ont pas pu partir : la déconnexion attend une confirmation. */
const unsent = ref<number | null>(null)

async function signOut(force = false): Promise<void> {
  accountMessage.value = ''
  const outcome = await accountSync.signOut({ force })
  if (!outcome.signedOut) {
    unsent.value = outcome.pending > 0 ? outcome.pending : null
    return
  }
  unsent.value = null
  // La copie locale du compte est effacée : sans autre profil sur l'appareil,
  // on revient à l'accueil.
  if (players.player === null) {
    await router.push({ name: ROUTE.auth })
    return
  }
  accountMessage.value = t('settings.account.signedOut')
}

async function deleteAccount(): Promise<void> {
  accountMessage.value = ''
  if (!(await accountSync.deleteAccount(deletePassword.value))) return
  deletePassword.value = ''
  accountMessage.value = t('settings.account.deleted')
}
</script>

<template>
  <section
    class="list-group"
    aria-labelledby="compte-donnees"
  >
    <h2
      id="compte-donnees"
      class="eyebrow list-group__title"
    >
      {{ t('settings.accountData.title') }}
    </h2>
    <p class="list-group__note">
      <template v-if="account.session">
        {{ t('settings.account.signedInAs', { email: account.session.email }) }}
      </template>
      <template v-else-if="account.status === 'unreachable'">
        {{ t('settings.account.unreachable') }}
      </template>
      <RichText
        v-else
        path="settings.account.withAccount"
      >
        <template #household>
          {{ t('settings.account.householdWord') }}<InfoTip
            :term="t('settings.account.householdWord')"
            :text="GLOSSARY.household"
          />
        </template>
      </RichText>
    </p>

    <ErrorNotice :error="account.error" />
    <ErrorNotice :error="dataExport.error.value" />

    <div
      v-if="unsent !== null"
      class="list-group__warning"
      role="alert"
    >
      <p>
        {{ unsent === Infinity ? t('settings.account.unsentSome') : t('settings.account.unsent', { n: unsent }) }}
      </p>
      <p>{{ t('settings.account.loseThem') }}</p>
      <div class="list-group__actions">
        <BaseButton
          variant="danger-filled"
          @click="signOut(true)"
        >
          {{ t('settings.account.signOutAnyway') }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          @click="unsent = null"
        >
          {{ t('settings.account.stay') }}
        </BaseButton>
      </div>
    </div>

    <ul class="list-rows">
      <li>
        <button
          type="button"
          class="list-row list-row--link"
          :aria-busy="dataExport.busy.value ? 'true' : undefined"
          aria-describedby="data-note"
          @click="dataExport.run()"
        >
          <span class="list-row__label">{{ t('settings.data.download') }}</span>
          <AppIcon
            name="chevron-right"
            class="list-row__chevron"
          />
        </button>
      </li>

      <template v-if="account.session">
        <li>
          <button
            type="button"
            class="list-row list-row--link"
            :aria-busy="account.status === 'loading' ? 'true' : undefined"
            aria-describedby="sign-out-note"
            @click="signOut()"
          >
            <span class="list-row__label">{{ t('settings.account.signOut') }}</span>
          </button>
        </li>
        <li>
          <details class="danger">
            <summary class="list-row list-row--link danger__summary">
              <span class="list-row__label">{{ t('settings.account.deleteSummary') }}</span>
              <AppIcon
                name="chevron-down"
                class="list-row__chevron danger__chevron"
              />
            </summary>
            <form
              class="danger__form"
              novalidate
              @submit.prevent="deleteAccount"
            >
              <p class="list-row__hint">
                {{ t('settings.account.deleteNote') }}
              </p>
              <PasswordField
                v-model="deletePassword"
                :label="t('settings.account.deletePassword')"
                autocomplete="current-password"
                required
              />
              <BaseButton
                type="submit"
                variant="danger-filled"
                :loading="account.status === 'loading'"
              >
                {{ t('settings.account.deleteButton') }}
              </BaseButton>
            </form>
          </details>
        </li>
      </template>

      <li v-else-if="account.status === 'unreachable'">
        <button
          type="button"
          class="list-row list-row--link"
          @click="account.load()"
        >
          <span class="list-row__label">{{ t('settings.account.retry') }}</span>
        </button>
      </li>

      <template v-else>
        <li>
          <RouterLink
            class="list-row list-row--link"
            :to="{ name: ROUTE.signIn }"
          >
            <span class="list-row__label">{{ t('settings.account.signIn') }}</span>
            <AppIcon
              name="chevron-right"
              class="list-row__chevron"
            />
          </RouterLink>
        </li>
        <li>
          <RouterLink
            class="list-row list-row--link"
            :to="{ name: ROUTE.signUp }"
          >
            <span class="list-row__label">{{ t('settings.account.create') }}</span>
            <AppIcon
              name="chevron-right"
              class="list-row__chevron"
            />
          </RouterLink>
        </li>
      </template>
    </ul>

    <p
      id="data-note"
      class="list-group__note"
    >
      {{ t('settings.data.note') }}
    </p>
    <p
      v-if="account.session"
      id="sign-out-note"
      class="list-group__note"
    >
      {{ t('settings.account.signOutNote') }}
    </p>
    <p
      class="list-group__saved"
      role="status"
      aria-live="polite"
    >
      <template v-if="dataExport.lastFileName.value">
        {{ t('settings.data.saved', { file: dataExport.lastFileName.value }) }}
      </template>
      {{ accountMessage }}
    </p>
  </section>
</template>

<style scoped lang="scss">
/* Lignes de réglage : l'intitulé prend la place, l'explication passe dessous. */
.list-row__label {
  flex: 1 1 8rem;
}

.list-row__hint {
  flex-basis: 100%;
}

.list-group__warning {
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-md);

  p {
    margin: 0 0 var(--space-2);
  }
}

.list-group__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Supprimer mon compte : une ligne en Tomate qui s'ouvre sur le formulaire. */
.danger__summary {
  color: var(--color-danger);
  font-weight: 700;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  .list-row__chevron {
    color: var(--color-danger);
  }
}

.danger[open] .danger__chevron {
  transform: rotate(180deg);
}

.danger__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}
</style>
