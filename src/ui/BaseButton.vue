<script setup lang="ts">
/**
 * Bouton de base.
 *
 * Toujours un vrai `<button>` (ou `<router-link>`), jamais un `<div>` cliquable :
 * le rôle, la gestion du clavier et l'annonce par les lecteurs d'écran viennent
 * gratuitement avec l'élément natif, et se reconstruisent mal à la main.
 *
 * Variantes de la direction « Marché » :
 * - `primary` : pilule pleine, l'action principale de l'écran ;
 * - `secondary` : pilule au trait ;
 * - `ghost` : sans fond, pour une action discrète ;
 * - `danger` : texte Tomate sans fond — « Supprimer » se lit, il ne crie pas ;
 * - `danger-filled` : pilule pleine Tomate, pour **confirmer** une suppression.
 */
import { computed } from 'vue'

import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-filled'
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

const emit = defineEmits<{ click: [MouseEvent] }>()

/**
 * Un bouton désactivé ou en cours de traitement reste **perceptible** et
 * gardable au focus : `aria-disabled` plutôt que `disabled`, qui le sortirait
 * de l'ordre de tabulation, déplacerait le focus sans prévenir et rendrait
 * introuvable la phrase qui explique pourquoi il est inactif.
 *
 * Le clic est alors absorbé, y compris l'envoi du formulaire : un bouton
 * `submit` inerte ne doit rien envoyer, pas même par Entrée dans un champ.
 */
const isInert = computed(() => props.disabled || props.loading)

function onClick(event: MouseEvent): void {
  if (isInert.value) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <button
    class="btn"
    :class="[
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--block': block, 'btn--disabled': disabled && !loading, 'btn--loading': loading },
    ]"
    :type="type"
    :aria-disabled="isInert ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <AppIcon
      v-if="loading"
      name="spinner"
      class="btn__spinner"
      :size="1.1"
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

  /* 52 px : l'action principale se vise sans effort, pouce compris. */
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-5);
  border: 2px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  transition:
    transform var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.btn:active:not([aria-disabled='true']) {
  transform: scale(0.97);
}

/* Cible tactile d'au moins 44 px — critère 2.5.8 de WCAG 2.2. */
.btn--sm {
  min-height: 2.75rem;
  padding: var(--space-1) var(--space-4);
  font-size: var(--font-size-sm);
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.btn--primary:hover:not([aria-disabled='true']) {
  background: var(--color-accent-strong);
}

.btn--secondary {
  background: transparent;
  border-color: var(--color-text);
  color: var(--color-text);
}

.btn--secondary:hover:not([aria-disabled='true']) {
  background: var(--color-surface);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text);
}

.btn--ghost:hover:not([aria-disabled='true']) {
  background: var(--color-surface);
}

.btn--danger {
  padding-inline: var(--space-3);
  background: transparent;
  color: var(--color-danger);
}

.btn--danger:hover:not([aria-disabled='true']) {
  background: var(--color-danger-soft);
  color: var(--color-danger-strong);
}

.btn--danger-filled {
  background: var(--color-danger);
  color: var(--color-bg);
}

/**
 * Désactivé : bord en tirets et fond neutre, pas une simple transparence qui
 * ferait tomber le texte sous le contraste exigé. La raison est écrite à
 * côté, par l'écran qui désactive.
 */
.btn--disabled {
  background: var(--color-track);
  border: 2px dashed var(--color-border-strong);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

/* En cours : l'apparence ne change pas, seul l'arc tourne. */
.btn--loading {
  cursor: progress;
}

.btn__spinner {
  animation: btn-spin 0.8s linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn__spinner {
    animation: none;
  }
}
</style>
