<script setup lang="ts">
/**
 * Les recettes que trouve une recherche, avant les aliments : on en ajoute une
 * d'un geste, ou on la supprime après confirmation.
 */
import { ref } from 'vue'

import { formatPortion } from '@/app/portionFormat'
import type { RecipeId } from '@/core/identity'
import { t } from '@/i18n'
import type { RecipeSummary } from '@/modules/nutrition_inventory/application'
import BaseButton from '@/ui/BaseButton.vue'

const props = defineProps<{
  recipes: readonly RecipeSummary[]
  busy: boolean
  add: (recipe: RecipeSummary) => Promise<void>
  remove: (recipe: RecipeSummary) => Promise<void>
}>()

/** Recette dont on demande la confirmation de suppression. */
const confirming = ref<RecipeId | null>(null)

function ingredients(recipe: RecipeSummary): string {
  return recipe.lines
    .map((line) => `${line.foodName} (${formatPortion(line.amount, line.measure)})`)
    .join(', ')
}

async function removeRecipe(recipe: RecipeSummary): Promise<void> {
  confirming.value = null
  await props.remove(recipe)
}
</script>

<template>
  <section
    class="recipes"
    aria-labelledby="recipe-results-title"
  >
    <h3
      id="recipe-results-title"
      class="recipes__title"
    >
      {{ recipes.length > 1 ? t('meal.recipes.many') : t('meal.recipes.one') }}
    </h3>

    <ul class="recipes__list">
      <li
        v-for="recipe in recipes"
        :key="recipe.recipeId"
        class="recipes__item"
      >
        <div class="recipes__text">
          <strong>{{ recipe.name }}</strong>
          <span class="recipes__lines">{{ ingredients(recipe) }}</span>
        </div>

        <div class="recipes__actions">
          <BaseButton
            size="sm"
            :disabled="busy"
            @click="add(recipe)"
          >
            {{ t('meal.recipes.add') }}<span class="sr-only">{{ t('meal.recipes.theRecipe', { name: recipe.name }) }}</span>
          </BaseButton>

          <template v-if="confirming === recipe.recipeId">
            <BaseButton
              size="sm"
              variant="danger"
              :disabled="busy"
              @click="removeRecipe(recipe)"
            >
              {{ t('meal.recipes.yesDelete') }}<span class="sr-only">{{ t('meal.recipes.theRecipe', { name: recipe.name }) }}</span>
            </BaseButton>
            <BaseButton
              size="sm"
              variant="ghost"
              @click="confirming = null"
            >
              {{ t('meal.recipes.no') }}
            </BaseButton>
          </template>
          <BaseButton
            v-else
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="confirming = recipe.recipeId"
          >
            {{ t('meal.recipes.delete') }}<span class="sr-only">{{ t('meal.recipes.theRecipe', { name: recipe.name }) }}</span>
          </BaseButton>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.recipes {
  margin-bottom: var(--space-4);
}

.recipes__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
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
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
}

.recipes__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow-wrap: break-word;
}

.recipes__lines {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.recipes__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
