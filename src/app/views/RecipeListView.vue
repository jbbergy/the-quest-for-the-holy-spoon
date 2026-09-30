<script setup lang="ts">
/**
 * Mes recettes : celles que j'ai gardées à partir d'un repas.
 *
 * Il n'y a pas de bouton « créer » : une recette naît d'un repas composé, avec
 * « Garder comme recette » dans l'éditeur de repas. L'écran le dit quand la
 * liste est vide. Chaque recette ouvre sa fiche, où elle se corrige.
 *
 * C'est l'onglet « Mes recettes » du garde-manger.
 */
import { computed, onMounted } from 'vue'

import PantryHeader from '@/app/components/PantryHeader.vue'
import { formatPortion } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useRecipeStore } from '@/modules/nutrition_inventory/presentation/useRecipeStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
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
    <PantryHeader />

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
      :aria-label="t('foods.pantry.recipes')"
    >
      <li
        v-for="recipe in recipeStore.recipes"
        :key="recipe.recipeId"
      >
        <RouterLink
          class="recipes__item"
          :to="{ name: ROUTE.recipeDetail, params: { recipeId: recipe.recipeId } }"
        >
          <span class="recipes__text">
            <span class="recipes__name">{{ recipe.name }}</span>
            <span class="recipes__meta">
              {{ t('recipes.list.meta', { n: recipe.lines.length, list: ingredients(recipe) }) }}
            </span>
          </span>
          <AppIcon
            name="chevron-right"
            class="recipes__chevron"
          />
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
  gap: var(--space-5);
}

/* Une seule carte, des lignes séparées par un filet : comme les aliments. */
.recipes__list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.recipes__list li + li {
  border-top: 1px solid var(--color-divider);
}

.recipes__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 4.25rem;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;
  overflow-wrap: break-word;

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.recipes__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.recipes__name {
  font-weight: 700;
}

.recipes__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.recipes__chevron {
  color: var(--color-text-muted);
}
</style>
