<script setup lang="ts">
/**
 * Tuile d'une grille « bento » : une information par tuile, un titre par
 * tuile.
 *
 * Le titre est un `<h2>` (ou le niveau demandé) : la grille reste une suite de
 * sections navigables au lecteur d'écran, dans l'ordre où elles se lisent.
 * `tip` ajoute une info-bulle au titre, pour un mot qu'on ne peut pas éviter.
 *
 * `wide` : la tuile occupe toute la largeur de la grille.
 */
import InfoTip from './InfoTip.vue'

withDefaults(
  defineProps<{
    title: string
    tip?: string
    subtitle?: string
    wide?: boolean
    level?: 2 | 3
  }>(),
  { level: 2 },
)
</script>

<template>
  <section
    class="tile"
    :class="{ 'tile--wide': wide }"
  >
    <component
      :is="`h${level}`"
      class="tile__title"
    >
      {{ title }}<InfoTip
        v-if="tip"
        :term="title"
        :text="tip"
      />
    </component>
    <p
      v-if="subtitle"
      class="tile__subtitle"
    >
      {{ subtitle }}
    </p>
    <slot />
  </section>
</template>

<style scoped lang="scss">
.tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.tile--wide {
  grid-column: 1 / -1;
}

.tile__title {
  margin: 0;
  font-size: var(--font-size-lg);
}

.tile__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
