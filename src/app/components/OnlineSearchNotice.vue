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
 */
import { computed } from 'vue'

import { useContainer } from '@/app/container'
import BaseButton from '@/ui/BaseButton.vue'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ retry: [] }>()

// Lu au rendu, c'est-à-dire juste après la recherche qui a échoué : c'est
// l'état du réseau à ce moment-là qui explique l'échec.
const online = computed(() => useContainer().network.isOnline())
</script>

<template>
  <div class="online-notice">
    <p class="online-notice__text">
      <span aria-hidden="true">⌁</span>
      <template v-if="online">
        Open Food Facts n’a pas répondu — son moteur de recherche est souvent saturé. Seul le
        catalogue local a été consulté : la liste peut être incomplète.
      </template>
      <template v-else>
        Hors connexion : seul le catalogue local a été consulté. Les produits de marque
        reviendront avec le réseau.
      </template>
    </p>

    <template v-if="online">
      <p class="online-notice__hint">
        Un code-barres saisi dans le champ passe par un autre service, qui reste généralement
        disponible.
      </p>
      <BaseButton
        variant="secondary"
        size="sm"
        :loading="busy"
        @click="emit('retry')"
      >
        Relancer la recherche en ligne
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
