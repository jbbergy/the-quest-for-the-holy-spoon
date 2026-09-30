<script setup lang="ts">
/**
 * D'où vient une fiche du catalogue.
 *
 * Les résultats mêlent désormais trois provenances dans une même liste triée,
 * et elles n'ont pas la même autorité : Ciqual est une table de composition
 * publiée par l'ANSES, Open Food Facts une base contributive alimentée par ses
 * utilisateurs, une fiche personnelle ce que vous avez saisi vous-même. Le
 * chiffre affiché ne vaut pas la même chose selon le cas, et l'utilisateur doit
 * pouvoir le savoir sans cliquer.
 *
 * Le tag n'est pas qu'une couleur : chaque source porte son libellé écrit, et
 * la teinte n'est qu'un renfort (critère 1.4.1).
 */
import { computed } from 'vue'

import { t } from '@/i18n'

import { FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'

/**
 * `author` : pour une fiche personnelle créée par un autre membre du foyer, son
 * nom. On sait alors qui l'a saisie — et donc à qui demander si un chiffre
 * paraît faux.
 */
const props = defineProps<{ source: string; author?: string | null }>()

/**
 * Des mots plutôt que des noms propres : « Ciqual » ne dit rien à qui ne le
 * connaît pas, « Catalogue public » dit d'où vient le chiffre. Les noms des
 * sources restent expliqués par une info-bulle, là où l'on cherche un aliment.
 */
const LABEL: Readonly<Record<string, string>> = {
  [FoodSource.CIQUAL]: 'ui.source.ciqual',
  [FoodSource.OPEN_FOOD_FACTS]: 'ui.source.openFoodFacts',
  [FoodSource.USER]: 'ui.source.user',
}

const TONE: Readonly<Record<string, string>> = {
  [FoodSource.CIQUAL]: 'tag--ciqual',
  [FoodSource.OPEN_FOOD_FACTS]: 'tag--off',
  [FoodSource.USER]: 'tag--user',
}

const label = computed(() =>
  props.source === FoodSource.USER && props.author != null
    ? t('ui.source.addedBy', { author: props.author })
    : t(LABEL[props.source] ?? props.source),
)
const tone = computed(() => TONE[props.source] ?? '')
</script>

<template>
  <span
    class="tag"
    :class="tone"
  >{{ label }}</span>
</template>

<style scoped lang="scss">
/* Fond teinté et texte foncé de la même famille, au moins 6:1 : la teinte
   aide à repérer la source, le libellé la dit. */
.tag {
  display: inline-block;
  padding: 0.1em 0.55em;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.tag--ciqual {
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.tag--off {
  background: var(--color-saffron-soft);
  color: var(--color-on-saffron-soft);
}

/* Contraste renforcé : le fond teinté ne suffit plus à détacher l'étiquette. */
@media (forced-colors: active) {
  .tag {
    border: 1px solid CanvasText;
  }
}
</style>
