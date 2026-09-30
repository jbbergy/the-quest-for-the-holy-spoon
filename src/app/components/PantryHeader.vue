<script setup lang="ts">
/**
 * En-tête du garde-manger : le titre et les deux onglets, aliments et recettes.
 *
 * Les onglets sont des **liens** vers deux adresses, pas un composant d'onglets
 * ARIA : chacun a son URL, que l'on peut garder en favori ou rouvrir en
 * revenant d'une fiche. L'onglet affiché porte `aria-current="page"`.
 *
 * Le nombre d'éléments de chaque onglet est lu à l'ouverture, sans filtre :
 * il dit ce que contient le garde-manger, pas ce que montre la recherche.
 */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useContainer } from '@/app/container'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useRecipeStore } from '@/modules/nutrition_inventory/presentation/useRecipeStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

const route = useRoute()
const recipeStore = useRecipeStore()
const players = usePlayerStore()

const foodCount = ref<number | null>(null)

onMounted(async () => {
  const foods = await useContainer().inventory.browseCustomFoods.execute('')
  if (foods.ok) foodCount.value = foods.value.length
  // L'onglet des recettes les charge lui-même : inutile de les lire deux fois.
  if (route.name !== ROUTE.recipes && recipeStore.status === 'idle' && players.playerId !== null) {
    await recipeStore.load(players.playerId)
  }
})

const tabs = [
  { name: ROUTE.foods, label: 'foods.pantry.foods' },
  { name: ROUTE.recipes, label: 'foods.pantry.recipes' },
] as const

function count(name: string): number | null {
  if (name === ROUTE.foods) return foodCount.value
  return recipeStore.status === 'ready' ? recipeStore.recipes.length : null
}
</script>

<template>
  <header class="pantry-header">
    <h1>{{ t('foods.pantry.title') }}</h1>
    <nav
      class="pantry-header__tabs"
      :aria-label="t('foods.pantry.tabsLabel')"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        class="pantry-header__tab"
        :to="{ name: tab.name }"
        :aria-current="route.name === tab.name ? 'page' : undefined"
      >
        {{ t(tab.label) }}
        <template v-if="count(tab.name) !== null">
          <span
            class="pantry-header__count"
            aria-hidden="true"
          >· {{ count(tab.name) }}</span>
          <span class="sr-only">, {{ t('foods.pantry.count', { n: count(tab.name) }) }}</span>
        </template>
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped lang="scss">
.pantry-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  h1 {
    margin: 0;
  }
}

/* Contrôle segmenté : un rail, et l'onglet affiché posé dessus. */
.pantry-header__tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-track);
  border-radius: var(--radius-md);
}

.pantry-header__tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3em;
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  border-radius: calc(var(--radius-md) - 4px);
  color: var(--color-text);
  font-weight: 500;
  text-align: center;
  text-decoration: none;
}

.pantry-header__tab {
  flex-wrap: wrap;
}

.pantry-header__count {
  white-space: nowrap;
}

.pantry-header__tab:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

/* L'onglet affiché : surface claire, bordure et gras — pas la seule teinte. */
.pantry-header__tab[aria-current='page'] {
  background: var(--color-surface-raised);
  box-shadow: inset 0 0 0 1px var(--color-border-strong);
  font-weight: 700;
}
</style>
