<script setup lang="ts">
/** État vide : dit ce qu'il n'y a pas, et propose quoi faire. */
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="empty">
    <p class="empty__title">
      {{ title }}
    </p>
    <p
      v-if="description"
      class="empty__description"
    >
      {{ description }}
    </p>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
}

.empty__title {
  margin: 0;
  color: var(--color-text);
  font-weight: 600;
}

.empty__description {
  margin: 0;
  font-size: var(--font-size-sm);
  max-width: 32ch;
}
</style>
