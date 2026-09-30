<script setup lang="ts">
/**
 * Une recette : son nom, ses ingrédients et leurs quantités.
 *
 * On y renomme, on corrige une quantité, on retire un ingrédient ou on
 * supprime la recette. Pour ajouter un ingrédient, on compose un repas puis on
 * le garde de nouveau comme recette. Les repas déjà composés avec la recette
 * ne changent jamais : ils ont leurs propres lignes.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { usePageTitle } from '@/app/pageTitle'
import { measureWord } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import type { RecipeId } from '@/core/identity'
import { t } from '@/i18n'
import type { RecipeLineSummary } from '@/modules/nutrition_inventory/application'
import { useRecipeStore } from '@/modules/nutrition_inventory/presentation/useRecipeStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const route = useRoute()
const router = useRouter()
const recipeStore = useRecipeStore()
const players = usePlayerStore()

const recipe = computed(() => recipeStore.current)
const recipeId = computed(() => route.params.recipeId as RecipeId)
usePageTitle(() => recipe.value?.name ?? t('shell.titles.recipe'))

const name = ref('')
const feedback = ref('')

watch(recipe, (next) => {
  if (next !== null) name.value = next.name
})

onMounted(() => recipeStore.open(recipeId.value))

const canRename = computed(
  () => recipe.value !== null && name.value.trim() !== '' && name.value.trim() !== recipe.value.name,
)

async function rename(): Promise<void> {
  if (!canRename.value) return
  feedback.value = (await recipeStore.rename(recipeId.value, name.value)) ? t('recipes.detail.nameSaved') : ''
}

/**
 * Corrige une quantité, saisie dans la mesure de la ligne. Sur `change` et non
 * sur `input` (une écriture par nombre, pas par chiffre) ; une valeur vide ou
 * nulle est ignorée, l'usager est en train de retaper son nombre.
 */
async function changeAmount(index: number, line: RecipeLineSummary, raw: string): Promise<void> {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return
  const saved = await recipeStore.changeLine(recipeId.value, index, value * line.measure.grams)
  feedback.value = saved ? t('recipes.detail.amountSaved', { food: line.foodName }) : ''
}

async function removeLine(index: number, line: RecipeLineSummary): Promise<void> {
  const saved = await recipeStore.removeLine(recipeId.value, index)
  feedback.value = saved ? t('recipes.detail.lineRemoved', { food: line.foodName }) : ''
}

async function remove(): Promise<void> {
  if (players.playerId === null) return
  if (await recipeStore.remove(players.playerId, recipeId.value)) {
    await router.push({ name: ROUTE.recipes })
  }
}

function amountValue(line: RecipeLineSummary): number {
  return line.measure.countable ? Math.round(line.amount * 100) / 100 : Math.round(line.amount)
}

function unit(line: RecipeLineSummary): string {
  return measureWord(line.measure, line.amount)
}
</script>

<template>
  <div class="recipe">
    <RouterLink
      class="recipe__back"
      :to="{ name: ROUTE.recipes }"
    >
      <span aria-hidden="true">←</span> {{ t('recipes.list.title') }}
    </RouterLink>

    <ErrorNotice :error="recipeStore.error" />

    <EmptyState
      v-if="recipe === null && recipeStore.status !== 'loading'"
      :title="t('recipes.detail.notFoundTitle')"
      :description="t('recipes.detail.notFoundDescription')"
    />

    <template v-else-if="recipe">
      <h1 class="recipe__title">
        {{ recipe.name }}
      </h1>

      <BaseCard :title="t('recipes.detail.nameCard')">
        <form
          class="recipe__rename"
          @submit.prevent="rename"
        >
          <label class="recipe__field">
            <span class="recipe__label">{{ t('recipes.detail.nameLabel') }}</span>
            <input
              v-model="name"
              type="text"
              maxlength="60"
              autocomplete="off"
            >
          </label>
          <BaseButton
            type="submit"
            variant="secondary"
            :disabled="!canRename || recipeStore.status === 'loading'"
          >
            {{ t('recipes.detail.rename') }}
          </BaseButton>
        </form>
      </BaseCard>

      <BaseCard
        :title="t('recipes.detail.foodsCard')"
        :subtitle="t('recipes.detail.foodsCount', { n: recipe.lines.length })"
      >
        <ul class="recipe__lines">
          <li
            v-for="(line, index) in recipe.lines"
            :key="`${index}-${line.foodItemId}`"
            class="recipe__line"
          >
            <span class="recipe__line-name">{{ line.foodName }}</span>

            <label class="recipe__amount">
              <span class="sr-only">{{ t('recipes.detail.amountOf', { food: line.foodName, unit: line.measure.label }) }}</span>
              <input
                type="number"
                inputmode="decimal"
                :min="line.measure.countable ? 0.25 : 1"
                :step="line.measure.countable ? 0.25 : 1"
                :value="amountValue(line)"
                @change="changeAmount(index, line, ($event.target as HTMLInputElement).value)"
              >
              <span
                class="recipe__unit"
                aria-hidden="true"
              >{{ unit(line) }}</span>
            </label>

            <BaseButton
              variant="ghost"
              size="sm"
              :disabled="recipe.lines.length === 1 || recipeStore.status === 'loading'"
              @click="removeLine(index, line)"
            >
              <span aria-hidden="true">×</span>
              <span class="sr-only">{{ t('recipes.detail.remove', { food: line.foodName }) }}</span>
            </BaseButton>
          </li>
        </ul>

        <p class="recipe__note">
          {{ t('recipes.detail.note') }}
        </p>
      </BaseCard>

      <p
        class="recipe__feedback"
        role="status"
        aria-live="polite"
      >
        {{ feedback }}
      </p>

      <div class="recipe__actions">
        <ConfirmButton
          :question="t('recipes.detail.deleteQuestion', { name: recipe.name })"
          :confirm-label="t('recipes.detail.delete')"
          :loading="recipeStore.status === 'loading'"
          @confirm="remove"
        >
          {{ t('recipes.detail.deleteRecipe') }}
        </ConfirmButton>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.recipe {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.recipe__back {
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

.recipe__title {
  margin: 0;
  overflow-wrap: anywhere;
}

.recipe__rename {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.recipe__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.recipe__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.recipe__field input {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
}

.recipe__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.recipe__line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.recipe__line-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.recipe__amount {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.recipe__unit {
  max-width: 6rem;
  overflow-wrap: anywhere;
}

.recipe__amount input {
  width: 4.5rem;
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.recipe__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.recipe__feedback {
  margin: 0;
  min-height: 1.5rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: center;
}

.recipe__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
