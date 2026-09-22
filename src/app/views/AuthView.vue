<script setup lang="ts">
/**
 * Accueil du profil local.
 *
 * L'application est entièrement locale : il n'y a ni compte, ni mot de passe, ni
 * serveur. Cet écran l'énonce clairement plutôt que d'imiter une page de
 * connexion — promettre une authentification inexistante induirait en erreur sur
 * l'endroit où vivent les données.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const router = useRouter()
const players = usePlayerStore()

onMounted(async () => {
  if (players.status === 'idle') await players.load()
})
</script>

<template>
  <div class="auth">
    <header class="auth__header">
      <p
        class="auth__mark"
        aria-hidden="true"
      >
        🥄
      </p>
      <h1>Bienvenue</h1>
      <p class="auth__intro">
        Suivez vos apports, progressez, et complétez vos journées sans y penser.
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <BaseCard
      v-if="players.player"
      title="Reprendre"
      :subtitle="`Profil « ${players.player.name} » trouvé sur cet appareil.`"
    >
      <BaseButton
        block
        @click="router.push({ name: ROUTE.dashboard })"
      >
        Continuer
      </BaseButton>
    </BaseCard>

    <BaseCard
      v-else
      title="Commencer"
      subtitle="Tout reste sur cet appareil : aucun compte, aucun serveur."
    >
      <BaseButton
        block
        @click="router.push({ name: ROUTE.profileSetup })"
      >
        Créer mon profil
      </BaseButton>
    </BaseCard>
  </div>
</template>

<style scoped lang="scss">
.auth {
  display: flex;
  min-height: 70dvh;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-5);
}

.auth__header {
  text-align: center;
}

.auth__mark {
  margin: 0;
  font-size: 3rem;
  line-height: 1;
}

.auth__intro {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
