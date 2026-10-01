<script setup lang="ts">
/**
 * Mot de passe oublié.
 *
 * La réponse est la même que l'adresse ait un compte ou non : le message le dit
 * au conditionnel, plutôt que d'affirmer un envoi qui n'a peut-être pas eu lieu.
 */
import { nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { useAccountFormErrors } from '@/app/accountForm'
import AccountLayout from '@/app/components/AccountLayout.vue'
import { focusFirstInvalid } from '@/app/focusInvalid'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import RichText from '@/ui/RichText.vue'

const account = useAccountStore()
const { emailError, formError } = useAccountFormErrors(() => account.error)

const email = ref('')
const sentTo = ref<string | null>(null)
const confirmation = ref<HTMLElement | null>(null)

onMounted(() => account.clearError())

async function submit(): Promise<void> {
  if (!(await account.requestPasswordReset(email.value))) {
    await focusFirstInvalid()
    return
  }

  sentTo.value = email.value.trim().toLowerCase()
  await nextTick()
  confirmation.value?.focus()
}
</script>

<template>
  <AccountLayout
    :title="t('account.forgot.title')"
    :intro="t('account.forgot.intro')"
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

        <BaseButton
          type="submit"
          block
          :loading="account.status === 'loading'"
        >
          {{ t('account.forgot.submit') }}
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard v-else>
      <p
        ref="confirmation"
        tabindex="-1"
        role="status"
      >
        <RichText path="account.forgot.sent">
          <template #email>
            <strong>{{ sentTo }}</strong>
          </template>
        </RichText>
      </p>
    </BaseCard>

    <template #links>
      <RouterLink :to="{ name: ROUTE.signIn }">
        {{ t('account.form.backToSignIn') }}
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
</style>
