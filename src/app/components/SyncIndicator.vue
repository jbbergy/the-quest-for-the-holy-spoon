<script setup lang="ts">
/**
 * État de la synchronisation, discret, en haut de l'écran.
 *
 * Le texte visible suit l'état en continu ; la région annoncée aux lecteurs
 * d'écran ne parle, elle, qu'aux moments qui comptent — perte du réseau, échec,
 * retour à la normale. Annoncer chaque « Synchronisation… » toutes les deux
 * écritures rendrait l'application bavarde au point d'être inutilisable.
 */
import { computed, ref, watch } from 'vue'

import { useContainer } from '@/app/container'
import { useSyncStatus } from '@/app/sync/useSyncStatus'

const { status } = useSyncStatus()
const announcement = ref('')

const plural = (count: number): string =>
  `${count} modification${count > 1 ? 's' : ''} en attente`

const label = computed(() => {
  const { phase, pending } = status.value
  switch (phase) {
    case 'syncing':
      return 'Synchronisation…'
    case 'offline':
      return pending > 0 ? `Hors ligne — ${plural(pending)}` : 'Hors ligne'
    case 'error':
      return 'Synchronisation impossible'
    default:
      return pending > 0 ? plural(pending) : 'À jour'
  }
})

watch(
  () => status.value.phase,
  (phase, previous) => {
    if (phase === 'offline') {
      announcement.value = 'Hors ligne : vos modifications seront envoyées au retour du réseau.'
    } else if (phase === 'error') {
      announcement.value = 'La synchronisation a échoué.'
    } else if (phase === 'idle' && (previous === 'offline' || previous === 'error')) {
      announcement.value = 'Synchronisation rétablie.'
    }
  },
)

function retry(): void {
  void useContainer().sync.sync()
}
</script>

<template>
  <div
    v-if="status.phase !== 'off'"
    class="sync"
    :class="`sync--${status.phase}`"
  >
    <span
      class="sync__dot"
      aria-hidden="true"
    />
    <span class="sync__label">{{ label }}</span>
    <button
      v-if="status.phase === 'error' || status.phase === 'offline'"
      type="button"
      class="sync__retry"
      @click="retry"
    >
      Réessayer
    </button>
    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.sync {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  min-height: 2rem;
  padding: 0 var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.sync__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-success);
}

/* La couleur n'est jamais seule porteuse du sens (critère 1.4.1) : le libellé
   dit toujours l'état. */
.sync--syncing .sync__dot {
  background: var(--color-accent);
}

.sync--offline .sync__dot {
  background: var(--color-text-muted);
}

.sync--error {
  color: var(--color-danger);
}

.sync--error .sync__dot {
  background: var(--color-danger);
}

.sync__retry {
  min-height: 44px;
  padding: 0 var(--space-2);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

@media (forced-colors: active) {
  .sync__dot {
    forced-color-adjust: none;
    background: CanvasText;
  }
}
</style>
