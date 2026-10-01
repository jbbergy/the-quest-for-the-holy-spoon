<script setup lang="ts" generic="T extends string">
/**
 * Filtres en pastilles : « Tout », « Les miens », « Catalogue public »…
 *
 * Ce sont de vrais boutons radio, rendus invisibles sous leur étiquette
 * stylée : le clavier (flèches) et l'annonce (« Les miens, bouton radio, 2 sur
 * 3 ») viennent de l'élément natif. Le filtre choisi se distingue par son fond
 * **et** par son texte en gras (critère 1.4.1).
 */
import { useId } from 'vue'

defineProps<{
  /** Ce que filtrent les pastilles, lu par les lecteurs d'écran. */
  legend: string
  options: readonly { readonly value: T; readonly label: string }[]
}>()

const model = defineModel<T>({ required: true })
const name = useId()
</script>

<template>
  <fieldset class="chips">
    <legend class="sr-only">
      {{ legend }}
    </legend>
    <label
      v-for="option in options"
      :key="option.value"
      class="chip"
    >
      <input
        v-model="model"
        class="chip__input"
        type="radio"
        :name="name"
        :value="option.value"
      >
      <span class="chip__label">{{ option.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped lang="scss">
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.chip {
  position: relative;
  display: inline-flex;
}

.chip__input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.chip__label {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.chip__input:checked + .chip__label {
  background: var(--color-inverse);
  border-color: var(--color-inverse);
  color: var(--color-on-inverse);
  font-weight: 700;
}

.chip__input:focus-visible + .chip__label {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@media (forced-colors: active) {
  .chip__input:checked + .chip__label {
    outline: 2px solid Highlight;
  }
}
</style>
