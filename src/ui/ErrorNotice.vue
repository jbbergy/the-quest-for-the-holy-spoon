<script setup lang="ts">
/**
 * Message d'erreur destiné à l'utilisateur.
 *
 * Il traduit le `code` d'une erreur typée en phrase compréhensible. Le `message`
 * d'origine, rédigé pour le développeur, n'est jamais affiché : il parle de
 * repositories et de payloads.
 */
import { computed } from 'vue'

import type { ErrorView } from '@/core/errors'
import { t, te } from '@/i18n'

import AppIcon from './AppIcon.vue'

const props = defineProps<{ error: ErrorView | null }>()

/**
 * Une phrase simple par erreur, puis ce qu'il faut faire. Pas de mot technique :
 * la personne doit comprendre ce qui s'est passé sans connaître l'application.
 * Les phrases sont dans `src/i18n/messages`, une par `code`.
 */
const text = computed(() => {
  if (props.error === null) return ''
  const key = `errors.${props.error.code}`
  return te(key) ? t(key) : t('errors.UNKNOWN')
})
</script>

<template>
  <p
    v-if="error"
    class="notice"
    role="alert"
  >
    <AppIcon
      name="alert"
      :size="1.15"
    />
    <span>{{ text }}</span>
  </p>
</template>

<style scoped lang="scss">
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-danger-strong);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.notice :deep(.icon) {
  color: var(--color-danger);
}
</style>
