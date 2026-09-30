<script setup lang="ts">
/**
 * Accueil : la journée en un écran, en tuiles.
 *
 * L'ordre suit ce qu'on vient y faire : les calories d'abord, puis les repas
 * du jour — l'action principale, cocher « Mangé » —, puis le conseil, puis le
 * détail des nutriments et de la semaine.
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
import { t } from '@/i18n'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BentoTile from '@/ui/BentoTile.vue'
import EmptyState from '@/ui/EmptyState.vue'
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

/** Le conseil, en phrases courtes, avec des exemples qui respectent le régime. */
const advice = computed(() => {
  const suggestion = tracking.suggestion.value
  if (suggestion === null) return []
  return adviceFor(suggestion, players.needs?.restrictions ?? [])
})

/** Les repas prévus aujourd'hui, dans l'ordre où on les mange. */
const todaysMeals = computed(() =>
  [...journal.meals].sort((a, b) => mealOrder(a.type) - mealOrder(b.type)),
)

/** Repas prévus mais pas encore mangés : ils ne comptent pas encore. */
const plannedCount = computed(() => journal.meals.length - journal.consumedMeals.length)

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
        {{ t('dashboard.eyebrow', { day: formatDay(clock.today) }) }}
      </p>
      <h1>{{ players.profileView ? t('dashboard.hello', { name: players.profileView.name }) : t('dashboard.helloAnonymous') }}</h1>
    </header>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="journal.error" />
    <ErrorNotice :error="history.error" />

    <DayOverview
      v-if="players.needs"
      :needs="players.needs"
      :total-calories="journal.totalCalories"
      :total-macros="journal.totalMacros"
      :total-detail="journal.totalDetail"
      :recent="tracking.recent.value"
      :planned-count="plannedCount"
      :consumed-count="journal.consumedMeals.length"
    >
      <template #after-calories>
        <BentoTile
          :title="t('dashboard.mealsTitle')"
          wide
        >
          <p
            v-if="plannedCount > 0"
            class="dashboard__planned-notice"
          >
            {{ t('dashboard.plannedNotice', { n: plannedCount }) }}
          </p>

          <EmptyState
            v-if="journal.isEmpty"
            :title="t('dashboard.emptyTitle')"
            :description="t('dashboard.emptyDescription')"
          />

          <ul
            v-else
            class="dashboard__meals"
          >
            <li
              v-for="meal in todaysMeals"
              :key="meal.mealId"
              class="dashboard__meal"
              :class="{ 'dashboard__meal--planned': meal.consumedAt === null }"
            >
              <RouterLink
                class="dashboard__meal-link"
                :to="{
                  name: ROUTE.mealEditor,
                  params: { mealId: meal.mealId },
                  query: returnQuery,
                }"
              >
                <span class="dashboard__meal-type">{{ mealLabel(meal.type) }}</span>
                <span class="dashboard__meal-kcal">{{ Math.round(meal.calories) }} kcal</span>
                <span class="dashboard__meal-foods">
                  {{ meal.entries.map((entry) => entry.foodName).join(', ') }}
                </span>
                <span class="sr-only">{{ t('dashboard.edit') }}</span>
              </RouterLink>
              <MealConsumedToggle
                :consumed-at="meal.consumedAt"
                :meal-label="mealLabel(meal.type)"
                @toggle="(next) => setConsumed(meal.mealId, next)"
              />
            </li>
          </ul>

          <div class="dashboard__actions">
            <BaseButton @click="$router.push(newMeal)">
              <span aria-hidden="true">＋</span> {{ t('dashboard.addMeal') }}
            </BaseButton>
            <BaseButton
              variant="ghost"
              @click="$router.push({ name: ROUTE.weekPlan })"
            >
              {{ t('dashboard.viewWeek') }} <span aria-hidden="true">→</span>
            </BaseButton>
          </div>
        </BentoTile>

        <BentoTile
          v-if="advice.length > 0"
          :title="t('dashboard.adviceTitle')"
          wide
        >
          <p
            v-for="line in advice"
            :key="line"
            class="dashboard__advice"
          >
            {{ line }}
          </p>
        </BentoTile>
      </template>
    </DayOverview>
  </div>
</template>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dashboard__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);

  &::first-letter {
    text-transform: uppercase;
  }
}

.dashboard__header h1 {
  margin: 0;
}

.dashboard__planned-notice,
.dashboard__advice {
  margin: 0;
}

.dashboard__planned-notice {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.dashboard__meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dashboard__meal {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}

/* Un repas prévu se distingue par un trait discontinu plutôt que par une
   couleur seule — critère 1.4.1 : la couleur n'est jamais le seul indice. */
.dashboard__meal--planned {
  background: transparent;
  border-style: dashed;
  border-color: var(--color-border);
}

.dashboard__meal-link {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-3);
  color: inherit;
  text-decoration: none;
}

.dashboard__meal-link:hover .dashboard__meal-type {
  text-decoration: underline;
}

.dashboard__meal-type {
  font-weight: 600;
}

.dashboard__meal-foods {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.dashboard__meal-kcal {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.dashboard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
