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
import { t } from '@/i18n'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BrandMark from '@/ui/BrandMark.vue'

const router = useRouter()
const players = usePlayerStore()

onMounted(async () => {
  if (players.status === 'idle') await players.load()
  await router.replace({ name: players.player === null ? ROUTE.auth : ROUTE.dashboard })
})
</script>

<template>
  <div class="splash">
    <BrandMark
      size="lg"
      :with-name="false"
    />
    <!-- Nom en anglais : `lang` le fait prononcer comme tel (critère 3.1.2). -->
    <h1
      class="splash__title"
      lang="en"
    >
      The Quest for the Holy Spoon
    </h1>
    <p
      class="splash__status"
      role="status"
      aria-live="polite"
    >
      <AppIcon
        name="spinner"
        class="splash__spinner"
      />
      {{ t('shell.splash.loading') }}
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
  gap: var(--space-3);
  text-align: center;
}

.splash__title {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-xl);
}

.splash__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.splash__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .splash__spinner {
    animation: none;
  }
}
</style>
