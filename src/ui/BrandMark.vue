<script setup lang="ts">
/**
 * La marque de l'application : une cuillère sur un disque safran, puis le nom.
 *
 * Elle remplace l'emoji 🥄, dont le dessin changeait d'un système à l'autre.
 * Décorative (`aria-hidden`) : chaque écran qui l'affiche a son propre titre.
 * Le nom est en anglais, et le reste dans toutes les langues.
 */
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ size?: 'md' | 'lg'; withName?: boolean }>(), {
  size: 'md',
  withName: true,
})
</script>

<template>
  <span
    class="brand"
    :class="`brand--${size}`"
    aria-hidden="true"
  >
    <span class="brand__disc">
      <AppIcon name="spoon" />
    </span>
    <span
      v-if="withName"
      class="brand__name"
      lang="en"
    >Holy Spoon</span>
  </span>
</template>

<style scoped lang="scss">
.brand {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.brand__disc {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--color-saffron);
  color: var(--color-on-saffron);
  font-size: 1.75rem;
}

.brand--lg .brand__disc {
  width: 5rem;
  height: 5rem;
  font-size: 2.6rem;
}

.brand__name {
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  line-height: 1.1;
}

.brand--lg .brand__name {
  font-size: var(--font-size-xl);
}
</style>
