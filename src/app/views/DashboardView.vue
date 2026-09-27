<script setup lang="ts">
/**
 * Tableau de bord : l'état de la journée en un écran.
 *
 * Toutes les valeurs viennent de read models ; aucun calcul nutritionnel n'est
 * refait ici. Les jauges s'animent parce que les entités sont remplacées en bloc
 * plutôt que mutées — c'est cette réassignation que `useAnimatedNumber` observe.
 */
import { computed, onMounted, watch } from 'vue'

import { useTodayStore } from '@/app/day/useTodayStore'
import { useDailyTracking } from '@/app/useDailyTracking'
import { dateOfDay } from '@/core/day'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { CompletionStatus } from '@/modules/planning/application'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseCard from '@/ui/BaseCard.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import BaseButton from '@/ui/BaseButton.vue'
import DayOverview from '@/app/components/DayOverview.vue'
import { mealLabel, mealOrder } from '@/app/mealLabels'
import { ROUTE } from '@/app/router'
import { useSyncStatus } from '@/app/sync/useSyncStatus'

const players = usePlayerStore()
const journal = useJournalStore()
const history = useConsumptionHistoryStore()
const tracking = useDailyTracking()
const clock = useTodayStore()

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
 * Formulations volontairement neutres : elles décrivent où en est la journée,
 * sans féliciter ni réprimander. L'application apprend à équilibrer ses apports,
 * elle ne juge pas celui qui les saisit.
 */
const STATUS_LABEL: Readonly<Record<string, string>> = {
  [CompletionStatus.ON_TRACK]: 'Il vous reste de la marge',
  [CompletionStatus.COMPLETE]: 'Journée équilibrée',
  [CompletionStatus.EXCEEDED]: 'Apports dépassés',
}

/** Macro la plus déficitaire : ce que l'assistant suggère de privilégier. */
const priority = computed(() => {
  const ratios = tracking.suggestion.value?.idealRatios
  if (ratios === undefined || ratios === null) return null

  const entries = [
    { label: 'protéines', share: ratios.protein },
    { label: 'glucides', share: ratios.carbs },
    { label: 'lipides', share: ratios.fat },
  ].sort((a, b) => b.share - a.share)

  const top = entries[0]
  return top === undefined || top.share === 0 ? null : top
})

/**
 * Fibres manquantes, arrondies au gramme ; `null` en deçà d'un gramme. Dites à
 * part des macros : une journée dont les calories sont atteintes peut encore en
 * manquer, et c'est le cas le plus courant.
 */
const fiberGap = computed(() => {
  const missing = Math.round(tracking.suggestion.value?.remainingFiberG ?? 0)
  return missing >= 1 ? missing : null
})

/** Les repas prévus aujourd'hui, dans l'ordre où on les mange. */
const todaysMeals = computed(() =>
  [...journal.meals].sort((a, b) => mealOrder(a.type) - mealOrder(b.type)),
)

/** Nombre de repas composés mais pas encore pris : ils n'alimentent rien. */
const plannedCount = computed(
  () => journal.meals.length - journal.consumedMeals.length,
)

async function setConsumed(mealId: MealSummary['mealId'], consumed: boolean): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.setConsumed(playerId, mealId, consumed)
}
</script>

<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <p class="dashboard__eyebrow">
        Aujourd’hui
      </p>
      <h1>{{ players.profileView?.name ?? 'Votre quête' }}</h1>
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
    />

    <BaseCard
      v-if="tracking.suggestion.value"
      title="L’assistant suggère"
    >
      <p class="dashboard__status">
        {{ STATUS_LABEL[tracking.suggestion.value.status] }} —
        <strong>{{ Math.round(tracking.suggestion.value.remainingCalories) }} kcal</strong>
      </p>
      <p
        v-if="priority"
        class="dashboard__hint"
      >
        Privilégiez un aliment riche en {{ priority.label }} : il vous manque
        {{ Math.round(tracking.suggestion.value.remainingMacros.proteinG) }} g de protéines,
        {{ Math.round(tracking.suggestion.value.remainingMacros.carbsG) }} g de glucides et
        {{ Math.round(tracking.suggestion.value.remainingMacros.fatG) }} g de lipides.
      </p>
      <p
        v-else
        class="dashboard__hint"
      >
        Vos apports couvrent vos besoins en énergie et en macronutriments.
      </p>
      <p
        v-if="fiberGap !== null"
        class="dashboard__hint"
      >
        Côté fibres, il en manque {{ fiberGap }} g : légumes, fruits, légumineuses et céréales
        complètes en apportent.
      </p>
      <BaseButton
        variant="secondary"
        size="sm"
        @click="$router.push({ name: ROUTE.foodSearch })"
      >
        Trouver un aliment
      </BaseButton>
    </BaseCard>

    <BaseCard title="Repas du jour">
      <p
        v-if="plannedCount > 0"
        class="dashboard__planned-notice"
      >
        {{ plannedCount }} repas composé{{ plannedCount > 1 ? 's' : '' }} en attente d’être
        pris — pas encore compté{{ plannedCount > 1 ? 's' : '' }} dans les jauges.
      </p>

      <EmptyState
        v-if="journal.isEmpty"
        title="Rien de prévu aujourd’hui"
        description="Composez un repas, ou planifiez ceux de la semaine."
      >
        <BaseButton
          @click="$router.push({ name: ROUTE.mealEditor, query: { jour: journal.journal?.day } })"
        >
          Composer un repas
        </BaseButton>
      </EmptyState>

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
          <span class="dashboard__meal-type">{{ mealLabel(meal.type) }}</span>
          <span class="dashboard__meal-foods">{{ meal.entries.map((entry) => entry.foodName).join(', ') }}</span>
          <span class="dashboard__meal-kcal">{{ Math.round(meal.calories) }} kcal</span>
          <MealConsumedToggle
            class="dashboard__meal-toggle"
            :consumed-at="meal.consumedAt"
            :meal-label="mealLabel(meal.type)"
            @toggle="(next) => setConsumed(meal.mealId, next)"
          />
        </li>
      </ul>

      <BaseButton
        v-if="!journal.isEmpty"
        class="dashboard__week-link"
        variant="ghost"
        size="sm"
        @click="$router.push({ name: ROUTE.weekPlan })"
      >
        Modifier ou planifier dans la semaine <span aria-hidden="true">→</span>
      </BaseButton>
    </BaseCard>

    <p class="dashboard__legend">
      Calories estimées par les coefficients d’Atwater
      ({{ KCAL_PER_GRAM.protein }}/{{ KCAL_PER_GRAM.carbs }}/{{ KCAL_PER_GRAM.fat }} kcal par
      gramme).
    </p>
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
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dashboard__header h1 {
  margin: 0;
}

.dashboard__status {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.dashboard__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.dashboard__planned-notice {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.dashboard__week-link {
  margin-top: var(--space-3);
}

.dashboard__meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dashboard__meal {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-3);
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

.dashboard__meal-toggle {
  grid-column: 1 / -1;
  margin-top: var(--space-2);
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

.dashboard__legend {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}
</style>
