<script setup lang="ts">
/**
 * Icône au trait.
 *
 * Toujours décorative (`aria-hidden`) : le sens est porté par le texte voisin
 * ou par le nom accessible du bouton qui la contient. Une icône seule dans un
 * bouton exige donc un `aria-label` ou un texte `sr-only` sur ce bouton.
 *
 * Elle prend la couleur du texte (`currentColor`) et sa taille suit celle de
 * la police, sauf `size` explicite : agrandir le texte agrandit les icônes.
 */
import { computed } from 'vue'

import { ICONS, type IconName } from './icons'

const props = defineProps<{
  name: IconName
  /** Taille en `em` ; 1.25 par défaut, soit 20 px pour un texte de 16 px. */
  size?: number
}>()

const shape = computed(() => ICONS[props.name])
const dimension = computed(() => `${props.size ?? 1.25}em`)
</script>

<template>
  <svg
    class="icon"
    :class="`icon--${name}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="shape.strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    :width="dimension"
    :height="dimension"
  >
    <component
      :is="element.tag"
      v-for="(element, index) in shape.elements"
      :key="index"
      v-bind="element.attrs"
    />
  </svg>
</template>

<style scoped lang="scss">
.icon {
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
