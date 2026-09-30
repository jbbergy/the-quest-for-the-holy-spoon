<script setup lang="ts">
/**
 * État de la synchronisation, en une pastille discrète à côté du bouton des
 * réglages : une marque et un mot (« À jour », « Hors ligne »).
 *
 * Le mot visible ouvre toujours ce qu'entend un lecteur d'écran, suivi du
 * détail (« 3 changements à envoyer ») : le nom accessible contient le texte
 * affiché (critère 2.5.3). Hors ligne ou en échec, la pastille entière est le
 * bouton qui relance l'envoi.
 *
 * La région annoncée, elle, ne parle qu'aux moments qui comptent — perte du
 * réseau, échec, retour à la normale. Annoncer chaque « Envoi… » toutes les
 * deux écritures rendrait l'application bavarde au point d'être inutilisable.
 */
import { computed, ref, watch } from 'vue'

import { useContainer } from '@/app/container'
import { t } from '@/i18n'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import AppIcon from '@/ui/AppIcon.vue'

const { status } = useSyncStatus()
const announcement = ref('')

/** Le mot affiché. */
const label = computed(() => {
  const { phase, pending } = status.value
  switch (phase) {
    case 'syncing':
      return t('shell.sync.syncing')
    case 'offline':
      return t('shell.sync.offline')
    case 'error':
      return t('shell.sync.error')
    default:
      return pending > 0 ? t('shell.sync.pendingShort', { n: pending }) : t('shell.sync.saved')
  }
})

/** Ce que le mot ne dit pas : le nombre de changements en attente, quand il n'y figure pas déjà. */
const detail = computed(() => {
  const { phase, pending } = status.value
  return (phase === 'offline' || phase === 'error') && pending > 0
    ? t('shell.sync.pending', { n: pending })
    : ''
})

const canRetry = computed(() => status.value.phase === 'offline' || status.value.phase === 'error')

watch(
  () => status.value.phase,
  (phase, previous) => {
    if (phase === 'offline') {
      announcement.value = t('shell.sync.offlineAnnouncement')
    } else if (phase === 'error') {
      announcement.value = t('shell.sync.errorAnnouncement')
    } else if (phase === 'idle' && (previous === 'offline' || previous === 'error')) {
      announcement.value = t('shell.sync.backOnline')
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
    <button
      v-if="canRetry"
      type="button"
      class="sync__chip sync__chip--action"
      @click="retry"
    >
      <AppIcon
        name="retry"
        :size="1.1"
      />
      <span class="sync__label">{{ label }}</span>
      <span class="sr-only">, <template v-if="detail">{{ detail }}, </template>{{ t('shell.sync.retrySpoken') }}</span>
    </button>
    <p
      v-else
      class="sync__chip"
    >
      <span
        class="sync__dot"
        aria-hidden="true"
      />
      <span class="sync__label">{{ label }}</span>
    </p>
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
  min-width: 0;
}

/* Une pastille : la marque et le mot, en petit, sur une seule ligne. */
.sync__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.sync__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sync__dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-success);
}

/* La couleur n'est jamais seule porteuse du sens (critère 1.4.1) : le mot
   dit toujours l'état. */
.sync--syncing .sync__dot {
  background: var(--color-marker);
}

.sync--idle .sync__dot {
  background: var(--color-success);
}

/* Hors ligne ou en échec : un bouton au trait, 44 px de haut pour le pouce,
   l'icône de relance devant le mot. */
.sync__chip--action {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  font: inherit;
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
  }
}

.sync--error .sync__chip--action {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

@media (forced-colors: active) {
  .sync__dot {
    forced-color-adjust: none;
    background: CanvasText;
  }
}
</style>
