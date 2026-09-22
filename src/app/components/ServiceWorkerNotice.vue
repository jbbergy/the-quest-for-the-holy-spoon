<script setup lang="ts">
/**
 * Annonces du service worker : mise à jour disponible, puis disponibilité hors
 * connexion.
 *
 * Deux messages, une seule bande : les afficher ensemble empilerait deux
 * bannières au-dessus de la barre de navigation sur un écran de 320 px. La mise
 * à jour passe devant, parce qu'elle appelle une décision alors que l'autre ne
 * fait que constater.
 *
 * La région est `role="status"` et non `role="alert"` : l'annonce est utile mais
 * n'interrompt rien, et couper la lecture en cours pour « prête hors connexion »
 * serait disproportionné.
 */
import { computed } from 'vue'

import { useServiceWorkerState } from '@/app/pwa/serviceWorker'
import BaseButton from '@/ui/BaseButton.vue'

const serviceWorker = useServiceWorkerState()

const mode = computed<'update' | 'offline' | null>(() => {
  if (serviceWorker.needRefresh.value) return 'update'
  if (serviceWorker.offlineReady.value) return 'offline'
  return null
})
</script>

<template>
  <div
    class="sw-notice"
    role="status"
    aria-live="polite"
  >
    <div
      v-if="mode === 'update'"
      class="sw-notice__panel"
    >
      <p class="sw-notice__text">
        Une nouvelle version est prête.
      </p>
      <div class="sw-notice__actions">
        <BaseButton
          size="sm"
          :loading="serviceWorker.applying.value"
          @click="serviceWorker.applyUpdate()"
        >
          Mettre à jour
        </BaseButton>
        <BaseButton
          size="sm"
          variant="ghost"
          @click="serviceWorker.dismissUpdate()"
        >
          Plus tard
        </BaseButton>
      </div>
    </div>

    <div
      v-else-if="mode === 'offline'"
      class="sw-notice__panel"
    >
      <p class="sw-notice__text">
        <span aria-hidden="true">✓</span>
        Prête à fonctionner sans connexion.
      </p>
      <div class="sw-notice__actions">
        <BaseButton
          size="sm"
          variant="ghost"
          @click="serviceWorker.dismissOfflineNotice()"
        >
          Fermer
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sw-notice {
  position: fixed;
  right: 0;
  /* Au-dessus de la barre de navigation, jamais par-dessus : celle-ci doit
     rester atteignable pendant que l'annonce est affichée. */
  bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px) + 4rem);
  left: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4);
  pointer-events: none;
}

.sw-notice__panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  width: 100%;
  max-width: var(--layout-max-width);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  pointer-events: auto;
}

.sw-notice__text {
  flex: 1;
  min-width: 10rem;
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.sw-notice__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
