<script setup lang="ts">
/**
 * Écran d'accueil.
 *
 * Il ne bloque sur rien : le profil est déjà chargé par la garde du router, et
 * la redirection part dès le montage. Son rôle est d'occuper le temps — très
 * court — entre l'ouverture de l'application et la première page utile.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

const router = useRouter()
const players = usePlayerStore()

onMounted(async () => {
  if (players.status === 'idle') await players.load()
  await router.replace({ name: players.player === null ? ROUTE.auth : ROUTE.dashboard })
})
</script>

<template>
  <div class="splash">
    <p
      class="splash__mark"
      aria-hidden="true"
    >
      🥄
    </p>
    <h1 class="splash__title">
      The Quest for the Holy Spoon
    </h1>
    <p
      class="splash__status"
      role="status"
      aria-live="polite"
    >
      Chargement…
    </p>
  </div>
</template>

<style scoped lang="scss">
.splash {
  display: flex;
  min-height: 70dvh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  text-align: center;
}

.splash__mark {
  margin: 0;
  font-size: 3.5rem;
  line-height: 1;
}

.splash__title {
  margin: 0;
  font-size: var(--font-size-xl);
}

.splash__status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
