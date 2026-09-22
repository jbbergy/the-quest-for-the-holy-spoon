<script setup lang="ts">
/**
 * Surface de contenu. Le titre est optionnel mais, lorsqu'il existe, il est rendu
 * en `<h2>` : les sections d'une page doivent former une hiérarchie de titres
 * navigable au lecteur d'écran, pas une suite de `<div>` stylés.
 */
defineProps<{ title?: string; subtitle?: string }>()
</script>

<template>
  <section class="card">
    <header
      v-if="title"
      class="card__header"
    >
      <h2 class="card__title">
        {{ title }}
      </h2>
      <p
        v-if="subtitle"
        class="card__subtitle"
      >
        {{ subtitle }}
      </p>
    </header>
    <slot />
  </section>
</template>

<style scoped lang="scss">
.card {
  padding: var(--space-5);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.card__header {
  margin-bottom: var(--space-4);
}

.card__title {
  margin: 0;
}

.card__subtitle {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
