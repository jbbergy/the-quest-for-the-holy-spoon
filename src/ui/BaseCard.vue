<script setup lang="ts">
/**
 * Surface de contenu. Le titre est optionnel mais, lorsqu'il existe, il est rendu
 * en `<h2>` : les sections d'une page doivent former une hiérarchie de titres
 * navigable au lecteur d'écran, pas une suite de `<div>` stylés.
 *
 * `collapsible` : la carte se replie sur son en-tête. Le titre devient alors un
 * bouton **à l'intérieur** du `<h2>` (motif accordéon) plutôt qu'un `<summary>` :
 * un titre placé dans un `<summary>` perd son rôle de titre pour plusieurs
 * lecteurs d'écran, et la page sa hiérarchie. Le sous-titre reste visible
 * replié : c'est lui qui résume ce que la carte contient.
 *
 * L'état ouvert appartient à l'appelant (`v-model:open`), qui décide de ce
 * qu'il en garde.
 *
 * Le slot `actions` se place dans l'en-tête, à côté du sous-titre : il reste
 * accessible carte repliée, pour les gestes qui n'ont pas besoin du contenu.
 */
import { useId } from 'vue'

import AppIcon from './AppIcon.vue'

const props = defineProps<{
  title?: string
  subtitle?: string
  collapsible?: boolean
  open?: boolean
}>()

const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const bodyId = useId()
</script>

<template>
  <section
    class="card"
    :class="{ 'card--collapsed': props.collapsible && !props.open }"
  >
    <header
      v-if="title"
      class="card__header"
    >
      <h2 class="card__title">
        <button
          v-if="props.collapsible"
          type="button"
          class="card__toggle"
          :aria-expanded="props.open ? 'true' : 'false'"
          :aria-controls="bodyId"
          @click="emit('update:open', !props.open)"
        >
          <span>{{ title }}</span>
          <AppIcon
            name="chevron-down"
            class="card__chevron"
          />
        </button>
        <template v-else>
          {{ title }}
        </template>
      </h2>
      <div
        v-if="subtitle || $slots.actions"
        class="card__meta"
      >
        <p
          v-if="subtitle"
          class="card__subtitle"
        >
          {{ subtitle }}
        </p>
        <div
          v-if="$slots.actions"
          class="card__actions"
        >
          <slot name="actions" />
        </div>
      </div>
    </header>
    <div
      v-if="props.collapsible"
      :id="bodyId"
      class="card__body"
      :hidden="!props.open"
    >
      <slot />
    </div>
    <slot v-else />
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

/* Titre de carte : la serif des titres, un cran sous celle des sections. */
.card__title {
  font-size: var(--font-size-lg);
}

.card__header {
  margin-bottom: var(--space-4);
}

.card--collapsed .card__header,
.card__header:has(+ .card__body:empty) {
  margin-bottom: 0;
}

.card__title {
  margin: 0;
}

/* Le bouton hérite de la typographie du titre : il en est le texte, pas un
   contrôle posé à côté. 44px de haut pour la cible tactile (critère 2.5.8). */
.card__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  margin: calc(-1 * var(--space-2)) 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card__chevron {
  color: var(--color-text-muted);
  transition: transform var(--duration-fast) var(--ease-out);
}

.card__toggle[aria-expanded='true'] .card__chevron {
  transform: rotate(180deg);
}

.card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1) var(--space-2);
  margin-top: var(--space-1);
}

.card__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-left: auto;
}

@media (prefers-reduced-motion: reduce) {
  .card__chevron {
    transition: none;
  }
}
</style>
