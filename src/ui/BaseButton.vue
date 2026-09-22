<script setup lang="ts">
/**
 * Bouton de base.
 *
 * Toujours un vrai `<button>` (ou `<router-link>`), jamais un `<div>` cliquable :
 * le rôle, la gestion du clavier et l'annonce par les lecteurs d'écran viennent
 * gratuitement avec l'élément natif, et se reconstruisent mal à la main.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'md' | 'sm'
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
  },
)

defineEmits<{ click: [MouseEvent] }>()

/**
 * Un bouton en cours de traitement reste **perceptible** et gardable au focus :
 * `aria-disabled` plutôt que `disabled`, qui le sortirait de l'ordre de
 * tabulation et déplacerait le focus sans prévenir.
 */
const isBusy = computed(() => props.loading)
const isInert = computed(() => props.disabled || props.loading)
</script>

<template>
  <button
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--block': block }]"
    :type="type"
    :disabled="disabled"
    :aria-disabled="isInert ? 'true' : undefined"
    :aria-busy="isBusy ? 'true' : undefined"
    @click="(event) => !isInert && $emit('click', event)"
  >
    <span
      v-if="loading"
      class="btn__spinner"
      aria-hidden="true"
    />
    <span class="btn__label"><slot /></span>
  </button>
</template>

<style scoped lang="scss">
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);

  /* Cible tactile d'au moins 44px — critère 2.5.8 de WCAG 2.2. */
  min-height: 44px;
  padding: var(--space-2) var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.btn:active:not([aria-disabled='true']) {
  transform: scale(0.97);
}

.btn[aria-disabled='true'] {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--sm {
  min-height: 36px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.btn--secondary {
  background: var(--color-surface-raised);
  border-color: var(--color-border);
  color: var(--color-text);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text);
}

.btn--ghost:hover:not([aria-disabled='true']) {
  background: var(--color-surface);
}

.btn--danger {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.btn__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentcolor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: btn-spin 0.7s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
