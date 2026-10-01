<script setup lang="ts">
/**
 * Les repas d'un membre du foyer, en frise, comme sur son propre accueil —
 * mais en lecture seule : ni case « Mangé », ni lien d'édition. Chaque repas
 * dit en toutes lettres s'il est prévu ou mangé ; le point plein ou vide
 * n'en est que le rappel (critère 1.4.1).
 */
import { mealLabel } from '@/app/mealLabels'
import { t } from '@/i18n'
import type { MealSummary } from '@/modules/nutrition_inventory/application'

defineProps<{
  /** « Repas d'Alex ». */
  title: string
  meals: readonly MealSummary[]
}>()
</script>

<template>
  <section
    class="day-meals meals"
    aria-labelledby="repas-du-membre"
  >
    <h2
      id="repas-du-membre"
      class="meals__title"
    >
      {{ title }}
    </h2>

    <div
      v-if="meals.length === 0"
      class="meals__empty"
    >
      <p class="meals__empty-title">
        {{ t('week.member.noMealsTitle') }}
      </p>
      <p>{{ t('week.member.noMealsDescription') }}</p>
    </div>

    <ol
      v-else
      class="meals__list"
    >
      <li
        v-for="meal in meals"
        :key="meal.mealId"
        class="meals__item member__meal"
        :class="{ 'meals__item--planned member__meal--planned': meal.consumedAt === null }"
      >
        <span
          class="meals__rail"
          aria-hidden="true"
        >
          <span class="meals__dot" />
        </span>
        <div class="meals__body">
          <p class="meals__meta">
            <span>{{ mealLabel(meal.type) }}</span>
            <span aria-hidden="true"> · </span><span class="sr-only">, </span>
            <span>{{ Math.round(meal.calories) }} kcal</span>
            <span aria-hidden="true"> · </span><span class="sr-only">, </span>
            <span class="member__meal-state">{{ meal.consumedAt === null ? t('week.member.planned') : t('week.member.eaten') }}</span>
          </p>
          <p class="meals__foods">
            {{ meal.entries.map((entry) => entry.foodName).join(', ') }}
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped lang="scss">
.meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.meals__title {
  margin: 0;
}

.meals__empty {
  color: var(--color-text-muted);

  p {
    margin: 0;
  }
}

.meals__empty-title {
  color: var(--color-text);
  font-weight: 700;
}

.meals__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.meals__item {
  display: flex;
  gap: var(--space-3);
}

/* Le rail : le point, puis un trait qui descend jusqu'au repas suivant. */
.meals__rail {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  width: 14px;
  padding-top: 6px;

  &::after {
    content: '';
    flex-grow: 1;
    width: 2px;
    background: var(--color-border);
  }
}

.meals__item:last-child .meals__rail::after {
  display: none;
}

.meals__dot {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-accent);
  border-radius: 50%;
  background: var(--color-accent);
}

.meals__item--planned .meals__dot {
  background: var(--color-bg);
}

.meals__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding-bottom: var(--space-5);

  p {
    margin: 0;
  }
}

.meals__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.meals__foods {
  overflow-wrap: break-word;
}
</style>
