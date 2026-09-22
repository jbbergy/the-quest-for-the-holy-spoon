<script setup lang="ts">
/**
 * Tableau de bord : l'état de la journée en un écran.
 *
 * Toutes les valeurs viennent de read models ; aucun calcul nutritionnel n'est
 * refait ici. Les jauges s'animent parce que les entités sont remplacées en bloc
 * plutôt que mutées — c'est cette réassignation que `useAnimatedNumber` observe.
 */
import { computed, onMounted } from 'vue'

import { useDailyTracking } from '@/app/useDailyTracking'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { useProgressStore } from '@/modules/gamification/presentation/useProgressStore'
import { CompletionStatus } from '@/modules/planning/application'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseCard from '@/ui/BaseCard.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MacroGauge from '@/ui/MacroGauge.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import XpBar from '@/ui/XpBar.vue'
import BaseButton from '@/ui/BaseButton.vue'
import { ROUTE } from '@/app/router'

const players = usePlayerStore()
const journal = useJournalStore()
const progress = useProgressStore()
const tracking = useDailyTracking()

onMounted(async () => {
  const playerId = players.playerId
  if (playerId !== null) await tracking.loadDay(playerId)
})

/**
 * Totaux du jour, lus sur le read model.
 *
 * L'agrégation appartient à `GetDailyJournalUseCase`, qui ne somme que les
 * repas **effectivement pris** — composer un repas à l'avance ne remplit pas
 * les jauges de quelqu'un qui n'a encore rien mangé. La refaire ici rouvrirait
 * la possibilité que deux écrans filtrent différemment.
 */
const consumed = computed(() => journal.totalMacros)
const consumedDetail = computed(() => journal.totalDetail)

const targets = computed(() => players.needs?.targetMacros ?? null)
const references = computed(() => players.needs?.referenceNutrients ?? null)

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

const MEAL_LABEL: Readonly<Record<string, string>> = {
  BREAKFAST: 'Petit-déjeuner',
  LUNCH: 'Déjeuner',
  DINNER: 'Dîner',
  SNACK: 'Collation',
}

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

    <BaseCard v-if="progress.view">
      <XpBar
        :level="progress.view.level"
        :ratio="progress.progressRatio"
        :xp-into-level="progress.view.xpIntoCurrentLevel"
        :xp-to-next-level="progress.view.xpToNextLevel"
        :levelled-up="progress.levelledUp"
        @celebrated="progress.acknowledgeLevelUp()"
      />
    </BaseCard>

    <!--
      Une seule carte pour toute la journée nutritionnelle : les apports et les
      repères ne se lisent pas séparément, on regarde ce qu'il reste à prendre
      et ce qu'on a déjà trop pris d'un même coup d'œil.

      Les fibres figurent avec les macros parce qu'elles sont, comme elles, un
      apport à atteindre. Seul le sens de lecture — objectif ou plafond —
      justifie une séparation, d'où le sous-titre plutôt qu'une seconde carte.
    -->
    <BaseCard
      v-if="targets && references && players.needs"
      title="Apports du jour"
      :subtitle="`${Math.round(journal.totalCalories)} sur ${Math.round(players.needs.targetCalories)} kcal`"
    >
      <div class="dashboard__gauges">
        <MacroGauge
          label="Calories"
          unit="kcal"
          :value="journal.totalCalories"
          :target="players.needs.targetCalories"
        />
        <MacroGauge
          label="Protéines"
          tone="protein"
          :value="consumed.proteinG"
          :target="targets.proteinG"
        />
        <MacroGauge
          label="Glucides"
          tone="carbs"
          :value="consumed.carbsG"
          :target="targets.carbsG"
        />
        <MacroGauge
          label="Lipides"
          tone="fat"
          :value="consumed.fatG"
          :target="targets.fatG"
        />
        <MacroGauge
          label="Fibres"
          tone="fiber"
          :value="consumedDetail.fiberG"
          :target="references.fiberG"
        />
      </div>

      <h3 class="dashboard__subhead">
        À ne pas dépasser
      </h3>
      <div class="dashboard__gauges">
        <MacroGauge
          label="Sucres"
          mode="limit"
          :value="consumedDetail.sugarsG"
          :target="references.sugarsG"
        />
        <MacroGauge
          label="AG saturés"
          mode="limit"
          :value="consumedDetail.saturatedFatG"
          :target="references.saturatedFatG"
        />
        <MacroGauge
          label="Sel"
          mode="limit"
          :value="consumedDetail.saltG"
          :target="references.saltG"
        />
      </div>

      <p
        v-if="plannedCount > 0 || journal.consumedMeals.length === 0"
        class="dashboard__hint"
      >
        Seuls les repas déclarés pris alimentent ces valeurs.
      </p>
    </BaseCard>

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
        Vos apports couvrent vos besoins du jour.
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
        title="Aucun repas enregistré"
        description="Ajoutez ce que vous avez mangé pour suivre vos apports."
      >
        <BaseButton @click="$router.push({ name: ROUTE.mealBuilder })">
          Composer un repas
        </BaseButton>
      </EmptyState>

      <ul
        v-else
        class="dashboard__meals"
      >
        <li
          v-for="meal in journal.meals"
          :key="meal.mealId"
          class="dashboard__meal"
          :class="{ 'dashboard__meal--planned': meal.consumedAt === null }"
        >
          <span class="dashboard__meal-type">{{ MEAL_LABEL[meal.type] ?? meal.type }}</span>
          <span class="dashboard__meal-foods">{{ meal.entries.map((entry) => entry.foodName).join(', ') }}</span>
          <span class="dashboard__meal-kcal">{{ Math.round(meal.calories) }} kcal</span>
          <MealConsumedToggle
            class="dashboard__meal-toggle"
            :consumed-at="meal.consumedAt"
            :meal-label="MEAL_LABEL[meal.type] ?? meal.type"
            @toggle="(next) => setConsumed(meal.mealId, next)"
          />
        </li>
      </ul>
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

.dashboard__gauges {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Sépare les plafonds des objectifs sans couper la carte en deux : c'est un
   changement de sens de lecture, pas un autre sujet. */
.dashboard__subhead {
  margin: var(--space-5) 0 var(--space-3);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
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
