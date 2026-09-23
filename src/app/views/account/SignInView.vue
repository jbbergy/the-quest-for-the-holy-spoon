<script setup lang="ts">
/**
 * Connexion.
 *
 * Après la connexion, le profil de l'appareil est rattaché au compte s'il ne
 * l'est pas encore, puis on rejoint l'accueil — ou la création du profil si
 * l'appareil n'en a pas.
 */
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useAccountFormErrors } from '@/app/accountForm'
import AccountLayout from '@/app/components/AccountLayout.vue'
import { returnPath, ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import PasswordField from '@/ui/PasswordField.vue'

const router = useRouter()
const route = useRoute()
const account = useAccountStore()
const players = usePlayerStore()
const { connect } = useAccountSync()
const { emailError, formError } = useAccountFormErrors(() => account.error)

const email = ref('')
const password = ref('')

onMounted(() => account.clearError())

async function submit(): Promise<void> {
  if (!(await account.signIn({ email: email.value, password: password.value }))) return

  await connect()
  if (players.player === null) {
    await router.push({ name: ROUTE.profileSetup })
    return
  }
  // Venu d'un lien — une invitation au foyer, par exemple : on y retourne.
  await router.push(returnPath(route.query.suite) ?? { name: ROUTE.dashboard })
}
</script>

<template>
  <AccountLayout title="Se connecter">
    <BaseCard>
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
        <PasswordField
          v-model="password"
          label="Mot de passe"
          autocomplete="current-password"
          required
        />

        <BaseButton
          type="submit"
          block
          :loading="account.status === 'loading'"
        >
          Se connecter
        </BaseButton>
      </form>
    </BaseCard>

    <template #links>
      <RouterLink :to="{ name: ROUTE.forgotPassword }">
        Mot de passe oublié ?
      </RouterLink>
      <RouterLink :to="{ name: ROUTE.signUp }">
        Créer un compte
      </RouterLink>
      <RouterLink :to="{ name: ROUTE.auth }">
        Continuer sans compte
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
