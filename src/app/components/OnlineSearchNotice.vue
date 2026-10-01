<script setup lang="ts">
/**
 * Bandeau affiché quand la recherche en ligne n'a pas abouti.
 *
 * Deux causes, deux messages : hors connexion, réessayer ne sert à rien ; en
 * ligne, c'est presque toujours le moteur de recherche d'Open Food Facts qui
 * refuse la requête — il est fortement bridé, au point de rejeter une requête
 * sur deux aux heures chargées. Un nouvel essai quelques secondes plus tard a
 * alors de bonnes chances d'aboutir, et le code-barres, servi par une autre
 * API, reste disponible.
 *
 * Si la connexion revient pendant que le bandeau est affiché, il le dit et
 * propose de relancer : sans cela, il resterait sur « pas connecté » alors
 * qu'une nouvelle recherche aboutirait.
 */
import { onBeforeUnmount, ref, watch } from 'vue'

import { useContainer } from '@/app/container'
import { t } from '@/i18n'
import BaseButton from '@/ui/BaseButton.vue'

const props = defineProps<{ busy: boolean }>()
const emit = defineEmits<{ retry: [] }>()

const network = useContainer().network

/** L'état du réseau quand la recherche a échoué : c'est lui qui explique l'échec. */
const failedOffline = ref(!network.isOnline())
/** L'état du réseau maintenant. */
const online = ref(network.isOnline())

onBeforeUnmount(network.subscribe((value) => (online.value = value)))

// Une relance vient d'échouer à son tour : sa cause remplace la précédente.
watch(
  () => props.busy,
  (busy, wasBusy) => {
    if (wasBusy && !busy) failedOffline.value = !network.isOnline()
  },
)
</script>

<template>
  <div class="online-notice">
    <p class="online-notice__text">
      <span aria-hidden="true">⌁</span>
      <template v-if="!online">
        {{ t('shell.onlineSearch.offline') }}
      </template>
      <template v-else-if="failedOffline">
        {{ t('shell.onlineSearch.reconnected') }}
      </template>
      <template v-else>
        {{ t('shell.onlineSearch.unavailable') }}
      </template>
    </p>
    <template v-if="online">
      <p
        v-if="!failedOffline"
        class="online-notice__hint"
      >
        {{ t('shell.onlineSearch.barcodeHint') }}
      </p>
      <BaseButton
        variant="secondary"
        size="sm"
        :loading="busy"
        @click="emit('retry')"
      >
        {{ t('shell.onlineSearch.retry') }}
      </BaseButton>
    </template>
  </div>
</template>

<style scoped lang="scss">
.online-notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.online-notice__text,
.online-notice__hint {
  margin: 0;
}

.online-notice__hint {
  color: var(--color-text-muted);
}
</style>
