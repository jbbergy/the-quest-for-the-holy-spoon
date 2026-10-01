<script setup lang="ts">
/**
 * Inscription.
 *
 * Aucune session ne s'ouvre ici : le compte n'existe qu'une fois l'adresse
 * confirmée par le lien reçu. Le message de fin couvre aussi le cas d'une
 * adresse déjà inscrite — le serveur ne dit pas lequel s'applique, et son
 * titulaire reçoit alors un e-mail pour se connecter.
 */
import { nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { newPasswordHint, useAccountFormErrors } from '@/app/accountForm'
import AccountLayout from '@/app/components/AccountLayout.vue'
import { focusFirstInvalid } from '@/app/focusInvalid'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import PasswordField from '@/ui/PasswordField.vue'
import RichText from '@/ui/RichText.vue'

const account = useAccountStore()
const { emailError, passwordError, formError } = useAccountFormErrors(() => account.error)

const email = ref('')
const password = ref('')
const sentTo = ref<string | null>(null)
const confirmation = ref<HTMLElement | null>(null)

/** En développement, aucun e-mail ne part : le lien s'affiche dans la console du serveur. */
const isDev = import.meta.env.DEV

onMounted(() => account.clearError())

async function submit(): Promise<void> {
  if (!(await account.signUp({ email: email.value, password: password.value }))) {
    await focusFirstInvalid()
    return
  }

  sentTo.value = email.value.trim().toLowerCase()
  password.value = ''
  // Le formulaire disparaît : le focus suit le message qui le remplace, sans
  // quoi il retomberait au début du document.
  await nextTick()
  confirmation.value?.focus()
}

function editAddress(): void {
  sentTo.value = null
}
</script>

<template>
  <AccountLayout
    :title="t('account.signUp.title')"
    :intro="t('account.signUp.intro')"
  >
    <BaseCard v-if="sentTo === null">
      <form
        class="account-form"
        novalidate
        @submit.prevent="submit"
      >
        <ErrorNotice :error="formError" />

        <BaseField
          v-model="email"
          :label="t('account.form.email')"
          type="email"
          autocomplete="email"
          required
          verbatim
          v-bind="emailError === undefined ? {} : { error: emailError }"
        />
        <PasswordField
          v-model="password"
          :label="t('account.form.password')"
          autocomplete="new-password"
          :hint="newPasswordHint()"
          required
          v-bind="passwordError === undefined ? {} : { error: passwordError }"
        />

        <BaseButton
          type="submit"
          block
          :loading="account.status === 'loading'"
        >
          {{ t('account.signUp.submit') }}
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard v-else>
      <div
        ref="confirmation"
        class="account-sent"
        tabindex="-1"
        role="status"
      >
        <h2 class="account-sent__title">
          {{ t('account.signUp.sentTitle') }}
        </h2>
        <p>
          <RichText path="account.signUp.sent">
            <template #email>
              <strong>{{ sentTo }}</strong>
            </template>
          </RichText>
        </p>
        <p class="account-sent__note">
          {{ t('account.signUp.existing') }}
        </p>
        <p
          v-if="isDev"
          class="account-sent__note"
        >
          {{ t('account.signUp.devNote') }}
        </p>
      </div>
      <BaseButton
        variant="secondary"
        @click="editAddress"
      >
        {{ t('account.signUp.changeAddress') }}
      </BaseButton>
    </BaseCard>

    <template #links>
      <RouterLink :to="{ name: ROUTE.signIn }">
        {{ t('account.signUp.haveAccount') }}
      </RouterLink>
      <RouterLink :to="{ name: ROUTE.auth }">
        {{ t('account.form.continueWithout') }}
      </RouterLink>
    </template>
  </AccountLayout>
</template>

<style scoped lang="scss">
.account-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.account-sent {
  margin-bottom: var(--space-4);
}

.account-sent__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.account-sent__note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
