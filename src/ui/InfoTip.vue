<script setup lang="ts">
/**
 * Info-bulle : un bouton « ? » qui explique un mot difficile.
 *
 * Motif « toggletip » plutôt qu'une bulle au survol : le survol n'existe pas
 * au doigt, et une bulle qui disparaît quand le pointeur bouge ne se lit pas
 * à son rythme (critère 1.4.13). Ici :
 *
 * - le bouton porte un nom qui dit ce qu'il explique (« Explication :
 *   glucides ») et `aria-expanded` ;
 * - l'explication est écrite dans une région `role="status"` au moment de
 *   l'ouverture : le lecteur d'écran la lit sans que le focus bouge ;
 * - Échap, un second appui ou un appui ailleurs la referme ;
 * - elle est placée en `position: fixed`, recalée dans l'écran, pour ne jamais
 *   déborder d'une carte étroite ni être rognée par elle.
 */
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'

import { t } from '@/i18n'

const props = defineProps<{
  /** Le mot expliqué, pour nommer le bouton. */
  term: string
  /** L'explication, en phrases courtes. */
  text: string
}>()

const open = ref(false)
/** Texte de la région annoncée : vide tant que fermée, pour être lu à chaque ouverture. */
const spoken = ref('')
const button = ref<HTMLButtonElement | null>(null)
const bubble = ref<HTMLElement | null>(null)
const position = ref({ top: 0, left: 0 })
const bubbleId = useId()

const label = computed(() => t('ui.infoTip', { term: props.term }))

/** Marge au bord de l'écran, la même que la gouttière des pages. */
const EDGE = 16

function place(): void {
  const anchor = button.value?.getBoundingClientRect()
  const box = bubble.value?.getBoundingClientRect()
  if (anchor === undefined || box === undefined) return

  const width = box.width
  const left = Math.min(
    Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2),
    window.innerWidth - width - EDGE,
  )
  // Dessous, sauf si la place manque : dessus.
  const below = anchor.bottom + 8
  const top =
    below + box.height > window.innerHeight - EDGE ? anchor.top - box.height - 8 : below
  position.value = { top: Math.max(EDGE, top), left }
}

async function show(): Promise<void> {
  open.value = true
  spoken.value = props.text
  // Mesurée une fois remplie : sa taille décide de sa place.
  await nextTick()
  place()
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', place, { passive: true, capture: true })
  window.addEventListener('resize', place)
}

function hide(): void {
  open.value = false
  spoken.value = ''
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', place, { capture: true })
  window.removeEventListener('resize', place)
}

function toggle(): void {
  if (open.value) hide()
  else void show()
}

function onOutside(event: PointerEvent): void {
  const target = event.target as Node | null
  if (target !== null && (button.value?.contains(target) || bubble.value?.contains(target))) return
  hide()
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  hide()
  button.value?.focus()
}

onBeforeUnmount(hide)
</script>

<template>
  <span class="tip">
    <button
      ref="button"
      type="button"
      class="tip__button"
      :aria-label="label"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="bubbleId"
      @click="toggle"
    >
      <span aria-hidden="true">?</span>
    </button>
    <span
      :id="bubbleId"
      ref="bubble"
      class="tip__bubble"
      :class="{ 'tip__bubble--open': open }"
      role="status"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >{{ spoken }}</span>
  </span>
</template>

<style scoped lang="scss">
.tip {
  display: inline-flex;
  vertical-align: middle;
}

/* Petit à l'œil, mais la zone d'appui fait 44 px (critère 2.5.8) : la marge
   négative l'élargit sans pousser le texte voisin. */
.tip__button {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 1.4em;
  height: 1.4em;
  margin: 0 0.15em;
  padding: 0;
  border: 1.5px solid currentcolor;
  border-radius: 50%;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-size: 0.85em;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
}

.tip__bubble {
  position: fixed;
  z-index: 50;
  display: none;
  width: max-content;
  max-width: min(20rem, calc(100vw - 32px));
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 400;
  letter-spacing: normal;
  line-height: var(--line-height-normal);
  text-align: left;
  text-transform: none;

  /* Une bulle peut expliquer plusieurs mots, un par ligne. */
  white-space: pre-line;
}

.tip__bubble--open {
  display: block;
}

@media (forced-colors: active) {
  .tip__bubble {
    border-color: CanvasText;
  }
}
</style>
