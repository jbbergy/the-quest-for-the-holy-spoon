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
.tag {
  display: inline-block;
  padding: 0.1em 0.5em;
  border: 1px solid currentcolor;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.tag--ciqual {
  color: var(--color-protein);
}

.tag--off {
  color: var(--color-carbs);
}

.tag--user {
  color: var(--color-fiber);
}
</style>
