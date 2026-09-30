<script setup lang="ts">
/**
 * Mes recettes : celles que j'ai gardées à partir d'un repas.
 *
 * Il n'y a pas de bouton « créer » : une recette naît d'un repas composé, avec
 * « Garder comme recette » dans l'éditeur de repas. L'écran le dit quand la
 * liste est vide. Chaque recette ouvre sa fiche, où elle se corrige.
 */
import { computed, onMounted } from 'vue'

import { formatPortion } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useRecipeStore } from '@/modules/nutrition_inventory/presentation/useRecipeStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import type { RecipeSummary } from '@/modules/nutrition_inventory/application'

const recipeStore = useRecipeStore()
const players = usePlayerStore()

const count = computed(() => recipeStore.recipes.length)

onMounted(async () => {
  if (players.playerId !== null) await recipeStore.load(players.playerId)
})

function ingredients(recipe: RecipeSummary): string {
  return recipe.lines
    .map((line) => `${line.foodName} (${formatPortion(line.amount, line.measure)})`)
    .join(', ')
}
</script>

<template>
  <div class="recipes">
    <RouterLink
      class="recipes__back"
      :to="{ name: ROUTE.settings }"
    >
      <span aria-hidden="true">←</span> {{ t('shell.nav.settings') }}
    </RouterLink>

    <h1>{{ t('recipes.list.title') }}</h1>

    <ErrorNotice :error="recipeStore.error" />

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ recipeStore.status === 'ready' ? t('recipes.list.count', { n: count }) : '' }}
    </p>

    <ul
      v-if="count > 0"
      class="recipes__list"
    >
      <li
        v-for="recipe in recipeStore.recipes"
        :key="recipe.recipeId"
      >
        <RouterLink
          class="recipes__item"
          :to="{ name: ROUTE.recipeDetail, params: { recipeId: recipe.recipeId } }"
        >
          <span class="recipes__name">{{ recipe.name }}</span>
          <span class="recipes__meta">
            {{ t('recipes.list.meta', { n: recipe.lines.length, list: ingredients(recipe) }) }}
          </span>
        </RouterLink>
      </li>
    </ul>

    <EmptyState
      v-else-if="recipeStore.status === 'ready'"
      :title="t('recipes.list.emptyTitle')"
      :description="t('recipes.list.emptyDescription')"
    >
      <BaseButton
        size="sm"
        variant="secondary"
        @click="$router.push({ name: ROUTE.mealEditor })"
      >
        {{ t('recipes.list.compose') }}
      </BaseButton>
    </EmptyState>
  </div>
</template>

<style scoped lang="scss">
.recipes {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.recipes h1 {
  margin: 0;
}

.recipes__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  color: var(--color-text-muted);
  text-decoration: none;

  &:hover {
    color: var(--color-text);
  }
}

.recipes__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.recipes__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 44px;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;

  &:hover {
    border-color: var(--color-accent);
  }
}

.recipes__name {
  font-weight: 600;
}

.recipes__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
