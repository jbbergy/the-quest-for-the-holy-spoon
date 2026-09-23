<script setup lang="ts">
/**
 * Page ouverte par le lien de confirmation.
 *
 * Le jeton est lu une fois, puis effacé de la barre d'adresse : un lien à usage
 * unique n'a rien à faire dans l'historique ou dans un favori. La confirmation
 * ouvre la session ; on ne redirige pas d'office — la personne lit le résultat,
 * puis choisit de continuer.
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { tokenFromHash } from '@/app/accountForm'
import AccountLayout from '@/app/components/AccountLayout.vue'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const route = useRoute()
const router = useRouter()
const account = useAccountStore()
const players = usePlayerStore()
const { connect } = useAccountSync()

const state = ref<'pending' | 'missing' | 'done' | 'failed'>('pending')

const next = computed(() => (players.player === null ? ROUTE.profileSetup : ROUTE.dashboard))

onMounted(async () => {
  account.clearError()
  const token = tokenFromHash(route.hash)
  if (token === null) {
    state.value = 'missing'
    return
  }
  await router.replace({ hash: '' })

  if (await account.verifyEmail(token)) {
    await connect()
    state.value = 'done'
  } else {
    state.value = 'failed'
  }
})
</script>

<template>
  <AccountLayout title="Confirmation de l’adresse">
    <BaseCard>
      <div
        class="verify"
        role="status"
      >
        <p v-if="state === 'pending'">
          Confirmation en cours…
        </p>
        <p v-else-if="state === 'missing'">
          Ce lien est incomplet. Ouvrez-le directement depuis l’e-mail reçu, sans le recopier.
        </p>
        <template v-else-if="state === 'done'">
          <p>
            Adresse confirmée. Vous êtes connecté avec <strong>{{ account.session?.email }}</strong>.
          </p>
        </template>
      </div>

      <ErrorNotice
        v-if="state === 'failed'"
        :error="account.error"
      />

      <BaseButton
        v-if="state === 'done'"
        block
        @click="router.push({ name: next })"
      >
        {{ players.player === null ? 'Créer mon profil' : 'Continuer' }}
      </BaseButton>
      <p
        v-if="state === 'failed'"
        class="verify__help"
      >
        Connectez-vous avec votre adresse et votre mot de passe : si l’adresse n’est toujours pas
        confirmée, un nouveau lien vous sera envoyé.
      </p>
    </BaseCard>

    <template
      v-if="state !== 'done'"
      #links
    >
      <RouterLink :to="{ name: ROUTE.signIn }">
        Se connecter
      </RouterLink>
      <RouterLink :to="{ name: ROUTE.auth }">
        Continuer sans compte
      </RouterLink>
    </template>
  </AccountLayout>
</template>

<style scoped lang="scss">
.verify {
  margin-bottom: var(--space-3);
}

.verify__help {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
