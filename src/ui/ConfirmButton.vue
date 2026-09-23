<script setup lang="ts">
/**
 * Bouton d'action à confirmer, sans fenêtre modale.
 *
 * Le premier clic ne fait rien d'irréversible : il remplace le bouton par la
 * question et deux réponses. Le focus suit — sur « confirmer » à l'ouverture,
 * de retour sur le bouton à l'annulation — sans quoi un utilisateur au clavier
 * se retrouverait sur un élément disparu, renvoyé en haut de la page.
 */
import { nextTick, ref } from 'vue'

import BaseButton from './BaseButton.vue'

withDefaults(
  defineProps<{
    /** Question posée, qui nomme ce qui sera perdu. */
    question: string
    confirmLabel: string
    cancelLabel?: string
    size?: 'md' | 'sm'
    loading?: boolean
  }>(),
  { cancelLabel: 'Annuler', size: 'md', loading: false },
)

const emit = defineEmits<{ confirm: [] }>()

const asking = ref(false)
const root = ref<HTMLElement | null>(null)

const focusFirst = (selector: string): void =>
  root.value?.querySelector<HTMLElement>(selector)?.focus()

async function ask(): Promise<void> {
  asking.value = true
  await nextTick()
  focusFirst('[data-confirm]')
}

async function cancel(): Promise<void> {
  asking.value = false
  await nextTick()
  focusFirst('button')
}

function confirm(): void {
  asking.value = false
  emit('confirm')
}
</script>

<template>
  <div
    ref="root"
    class="confirm"
  >
    <BaseButton
      v-if="!asking"
      variant="danger"
      :size="size"
      :loading="loading"
      @click="ask"
    >
      <slot />
    </BaseButton>

    <div
      v-else
      class="confirm__question"
      role="group"
      :aria-label="question"
    >
      <p class="confirm__text">
        {{ question }}
      </p>
      <div class="confirm__actions">
        <BaseButton
          data-confirm
          variant="danger"
          :size="size"
          @click="confirm"
        >
          {{ confirmLabel }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          :size="size"
          @click="cancel"
        >
          {{ cancelLabel }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.confirm__question {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.confirm__text {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
