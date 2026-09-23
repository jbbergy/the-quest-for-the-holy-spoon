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
import { ROUTE } from '@/app/router'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const account = useAccountStore()
const { emailError, formError } = useAccountFormErrors(() => account.error)

const email = ref('')
const sentTo = ref<string | null>(null)
const confirmation = ref<HTMLElement | null>(null)

onMounted(() => account.clearError())

async function submit(): Promise<void> {
  if (!(await account.requestPasswordReset(email.value))) return

  sentTo.value = email.value.trim().toLowerCase()
  await nextTick()
  confirmation.value?.focus()
}
</script>

<template>
  <AccountLayout
    title="Mot de passe oublié"
    intro="Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe."
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
          label="Adresse e-mail"
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
          Recevoir un lien
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard v-else>
      <p
        ref="confirmation"
        tabindex="-1"
        role="status"
      >
        Si un compte existe pour <strong>{{ sentTo }}</strong>, un lien valable une heure vient d’y
        être envoyé.
      </p>
    </BaseCard>

    <template #links>
      <RouterLink :to="{ name: ROUTE.signIn }">
        Retour à la connexion
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
