<script setup lang="ts">
/**
 * Page ouverte par le lien de réinitialisation.
 *
 * Le jeton est gardé en mémoire puis effacé de la barre d'adresse dès
 * l'arrivée. Changer de mot de passe ferme les sessions ouvertes ailleurs et en
 * ouvre une sur cet appareil.
 */
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { NEW_PASSWORD_HINT, tokenFromHash, useAccountFormErrors } from '@/app/accountForm'
import AccountLayout from '@/app/components/AccountLayout.vue'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import PasswordField from '@/ui/PasswordField.vue'

const route = useRoute()
const router = useRouter()
const account = useAccountStore()
const players = usePlayerStore()
const { connect } = useAccountSync()
const { passwordError, formError } = useAccountFormErrors(() => account.error)

const token = ref<string | null>(null)
const password = ref('')
const ready = ref(false)

onMounted(async () => {
  account.clearError()
  token.value = tokenFromHash(route.hash)
  if (token.value !== null) await router.replace({ hash: '' })
  ready.value = true
})

async function submit(): Promise<void> {
  if (token.value === null) return
  if (!(await account.resetPassword({ token: token.value, password: password.value }))) return

  await connect()
  await router.push({ name: players.player === null ? ROUTE.profileSetup : ROUTE.dashboard })
}
</script>

<template>
  <AccountLayout title="Nouveau mot de passe">
    <BaseCard v-if="ready && token === null">
      <p role="status">
        Ce lien est incomplet. Ouvrez-le directement depuis l’e-mail reçu, ou demandez-en un
        nouveau.
      </p>
    </BaseCard>

    <BaseCard v-else-if="ready">
      <form
        class="account-form"
        novalidate
        @submit.prevent="submit"
      >
        <ErrorNotice :error="formError" />

        <PasswordField
          v-model="password"
          label="Nouveau mot de passe"
          autocomplete="new-password"
          :hint="NEW_PASSWORD_HINT"
          required
          v-bind="passwordError === undefined ? {} : { error: passwordError }"
        />

        <BaseButton
          type="submit"
          block
          :loading="account.status === 'loading'"
        >
          Enregistrer et me connecter
        </BaseButton>
      </form>
    </BaseCard>

    <template #links>
      <RouterLink :to="{ name: ROUTE.forgotPassword }">
        Demander un nouveau lien
      </RouterLink>
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
