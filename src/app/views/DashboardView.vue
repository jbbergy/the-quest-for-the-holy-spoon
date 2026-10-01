<script setup lang="ts">
/**
 * Aujourd'hui : la journée en un écran.
 *
 * L'ordre suit ce qu'on vient y faire : ce qui reste à manger d'abord, puis
 * les repas du jour — l'action principale, cocher « Mangé » —, puis le
 * conseil, puis les limites et la semaine.
 *
 * Les repas se lisent comme une frise : un point plein pour un repas mangé,
 * un point creux pour un repas prévu. Le point ne fait que redire ce
 * qu'écrivent le mot « prévu » et le bouton « Mangé » (critère 1.4.1).
 *
 * Toutes les valeurs viennent de read models ; aucun calcul nutritionnel n'est
 * refait ici. Les anneaux s'animent parce que les entités sont remplacées en
 * bloc plutôt que mutées — c'est cette réassignation que `useAnimatedNumber`
 * observe.
 */
import { computed, onMounted, watch } from 'vue'

import { adviceFor } from '@/app/advice'
import DayOverview from '@/app/components/DayOverview.vue'
import { useTodayStore } from '@/app/day/useTodayStore'
import { formatDay, mealLabel, mealOrder } from '@/app/mealLabels'
import { ROUTE } from '@/app/router'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import { useDailyTracking } from '@/app/useDailyTracking'
import { useReturnQuery } from '@/app/useBackLink'
import { dateOfDay } from '@/core/day'
import { lower, t, upperFirst } from '@/i18n'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

const players = usePlayerStore()
const journal = useJournalStore()
const history = useConsumptionHistoryStore()
const tracking = useDailyTracking()
const clock = useTodayStore()
const returnQuery = useReturnQuery()

async function load(): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await tracking.loadDay(playerId, dateOfDay(clock.today))
}

onMounted(load)

// Un repas coché sur un autre appareil apparaît ici sans recharger la page ;
// la journée suivante aussi, dès l'heure de début choisie passée.
const { remoteRevision } = useSyncStatus()
watch([remoteRevision, () => players.playerId, () => clock.today], load)

/**
 * Le conseil, en phrases courtes, avec des exemples qui respectent le régime.
 *
 * Rien tant qu'aucun repas n'est mangé : il ne ferait que redire la jauge
 * (« il vous manque 282 g de glucides ») à une journée qui n'a pas commencé.
 */
const advice = computed(() => {
  const suggestion = tracking.suggestion.value
  if (suggestion === null || journal.consumedMeals.length === 0) return []
  return adviceFor(suggestion, players.needs?.restrictions ?? [])
})

/** Les repas prévus aujourd'hui, dans l'ordre où on les mange. */
const todaysMeals = computed(() =>
  [...journal.meals].sort((a, b) => mealOrder(a.type) - mealOrder(b.type)),
)

/** Repas prévus mais pas encore mangés : ils ne comptent pas encore. */
const plannedMeals = computed(() => todaysMeals.value.filter((meal) => meal.consumedAt === null))
const plannedCount = computed(() => plannedMeals.value.length)
const plannedCalories = computed(() =>
  plannedMeals.value.reduce((sum, meal) => sum + meal.calories, 0),
)
const plannedNames = computed(() => plannedMeals.value.map((meal) => lower(mealLabel(meal.type))))

async function setConsumed(mealId: MealSummary['mealId'], consumed: boolean): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.setConsumed(playerId, mealId, consumed)
}

const newMeal = computed(() => ({
  name: ROUTE.mealEditor,
  query: { jour: clock.today, ...returnQuery.value },
}))
</script>

<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <p class="dashboard__eyebrow">
        {{ upperFirst(formatDay(clock.today)) }}
      </p>
      <h1>{{ t('dashboard.title') }}</h1>
    </header>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="journal.error" />
    <ErrorNotice :error="history.error" />

    <DayOverview
      v-if="players.needs"
      :day="clock.today"
      :needs="players.needs"
      :total-calories="journal.totalCalories"
      :total-macros="journal.totalMacros"
      :total-detail="journal.totalDetail"
      :recent="tracking.recent.value"
      :planned-count="plannedCount"
      :planned-calories="plannedCalories"
      :planned-meals="plannedNames"
      :consumed-count="journal.consumedMeals.length"
    >
      <template #after-calories>
        <section
          class="day-meals meals"
          aria-labelledby="repas-du-jour"
        >
          <div class="meals__head">
            <h2 id="repas-du-jour">
              {{ t('dashboard.mealsTitle') }}
            </h2>
            <RouterLink
              class="meals__week"
              :to="{ name: ROUTE.weekPlan }"
            >
              {{ t('dashboard.viewWeek') }}
            </RouterLink>
          </div>

          <div
            v-if="journal.isEmpty"
            class="meals__empty"
          >
            <p class="meals__empty-title">
              {{ t('dashboard.emptyTitle') }}
            </p>
            <p>{{ t('dashboard.emptyDescription') }}</p>
          </div>

          <ol class="meals__list">
            <li
              v-for="meal in todaysMeals"
              :key="meal.mealId"
              class="meals__item"
              :class="{ 'meals__item--planned': meal.consumedAt === null }"
            >
              <span
                class="meals__rail"
                aria-hidden="true"
              >
                <span class="meals__dot" />
              </span>
              <div class="meals__body">
                <div class="meals__text">
                  <span class="meals__meta">
                    {{ t('dashboard.mealMeta', { meal: mealLabel(meal.type), kcal: Math.round(meal.calories) }) }}<template v-if="meal.consumedAt === null"> · {{ t('dashboard.planned') }}</template>
                  </span>
                  <RouterLink
                    class="meals__foods"
                    :to="{
                      name: ROUTE.mealEditor,
                      params: { mealId: meal.mealId },
                      query: returnQuery,
                    }"
                  >
                    {{ meal.entries.map((entry) => entry.foodName).join(', ') }}
                    <span class="sr-only">{{ mealLabel(meal.type) }}{{ t('dashboard.edit') }}</span>
                  </RouterLink>
                </div>
                <MealConsumedToggle
                  :consumed-at="meal.consumedAt"
                  :meal-label="mealLabel(meal.type)"
                  :show-time="false"
                  @toggle="(next) => setConsumed(meal.mealId, next)"
                />
              </div>
            </li>
            <li class="meals__item meals__item--add">
              <span
                class="meals__rail"
                aria-hidden="true"
              >
                <span class="meals__dot" />
              </span>
              <RouterLink
                class="meals__add"
                :to="newMeal"
              >
                <AppIcon name="plus" />
                {{ t('dashboard.addMeal') }}
              </RouterLink>
            </li>
          </ol>
        </section>
      </template>

      <template #after-nutrients>
        <aside
          v-if="advice.length > 0"
          class="day-advice advice"
          aria-labelledby="conseil-du-jour"
        >
          <span
            class="advice__icon"
            aria-hidden="true"
          >
            <AppIcon name="leaf" />
          </span>
          <div class="advice__text">
            <h2
              id="conseil-du-jour"
              class="advice__title"
            >
              {{ t('dashboard.adviceTitle') }}
            </h2>
            <p
              v-for="line in advice"
              :key="line"
            >
              {{ line }}
            </p>
          </div>
        </aside>
      </template>
    </DayOverview>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.dashboard__header h1 {
  margin: 0;
}

.dashboard__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Repas du jour : une frise, un point par repas. */
.meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.meals__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-3);

  h2 {
    margin: 0;
  }
}

.meals__week {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: var(--font-size-sm);
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

.meals__item--add .meals__rail {
  padding-top: 1.1rem;

  &::after {
    display: none;
  }
}

.meals__item--add .meals__dot {
  width: 8px;
  height: 8px;
  border: none;
  background: var(--color-border-strong);
}

.meals__body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding-bottom: var(--space-5);
}

.meals__text {
  display: flex;
  flex: 1 1 10rem;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.meals__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.meals__foods {
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;
  overflow-wrap: break-word;

  &:hover {
    color: var(--color-text);
    text-decoration: underline;
  }
}

/* Ajouter un repas : un emplacement en pointillé, là où viendra le repas. */
.meals__add {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 3.25rem;
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-accent);
  text-decoration: none;

  &:hover {
    background: var(--color-accent-soft);
    color: var(--color-accent-strong);
  }
}

/* Le conseil : un encart safran pâle, jamais du safran pour le texte. */
.advice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--color-saffron-soft);
  border-radius: var(--radius-lg);
  color: var(--color-on-saffron-soft);
}

.advice__icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--color-surface-raised);
  color: var(--color-text);
}

.advice__text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  p {
    margin: 0;
  }
}

.advice .advice__title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--font-size-md);
  font-weight: 700;
  letter-spacing: normal;
}
</style>
