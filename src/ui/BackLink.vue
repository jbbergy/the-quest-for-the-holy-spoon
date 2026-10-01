<script setup lang="ts">
/**
 * Retour à l'écran d'où l'on vient : un chevron, puis le nom de cet écran.
 *
 * Le nom reste écrit : « ‹ » seul ne dirait pas où l'on va, ni à l'œil ni au
 * lecteur d'écran. La cible fait 44 px de haut ; ses marges négatives la
 * gardent alignée sur le texte de la page.
 */
import { RouterLink, type RouteLocationRaw } from 'vue-router'

import AppIcon from './AppIcon.vue'

defineProps<{
  to: RouteLocationRaw
  label: string
}>()
</script>

<template>
  <RouterLink
    class="back-link"
    :to="to"
  >
    <AppIcon name="chevron-left" />
    {{ label }}
  </RouterLink>
</template>

<style scoped lang="scss">
.back-link {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--space-1);
  min-height: 44px;
  margin: calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-2));
  padding: 0 var(--space-3) 0 var(--space-1);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-size: var(--font-size-sm);

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
}
</style>
