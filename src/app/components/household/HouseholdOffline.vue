<script setup lang="ts">
/** Serveur injoignable : le pictogramme, le mot, et de quoi réessayer. */
import { t } from '@/i18n'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="offline">
    <AppIcon
      name="offline"
      class="offline__icon"
    />
    <div class="offline__text">
      <h2 class="offline__title">
        {{ t('household.unreachableTitle') }}
      </h2>
      <p>{{ t('household.unreachableText') }}</p>
      <BaseButton
        variant="secondary"
        size="sm"
        @click="emit('retry')"
      >
        {{ t('household.retry') }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Hors ligne : un bloc discontinu, le pictogramme et le mot. */
.offline {
  display: flex;
  gap: var(--space-3);
  padding: var(--card-padding);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
}

.offline__icon {
  flex-shrink: 0;
  margin-top: 0.2em;
  color: var(--color-text-muted);
}

.offline__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }
}

.offline__title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  font-weight: 700;
}
</style>
