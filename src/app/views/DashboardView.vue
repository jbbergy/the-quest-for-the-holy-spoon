<script setup lang="ts">
/**
 * Tableau de bord : l'état de la journée en un écran.
 *
 * Toutes les valeurs viennent de read models ; aucun calcul nutritionnel n'est
 * refait ici. Les jauges s'animent parce que les entités sont remplacées en bloc
 * plutôt que mutées — c'est cette réassignation que `useAnimatedNumber` observe.
 */
import { computed, onMounted, watch } from 'vue'

import { useDailyTracking } from '@/app/useDailyTracking'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import {
  CompletionStatus,
  type DayBalance,
  type Nutrient,
  RECENT_DAYS,
} from '@/modules/planning/application'
import type { MealSummary } from '@/modules/nutrition_inventory/application'
import { useConsumptionHistoryStore } from '@/modules/nutrition_inventory/presentation/useConsumptionHistoryStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseCard from '@/ui/BaseCard.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MacroGauge from '@/ui/MacroGauge.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import BaseButton from '@/ui/BaseButton.vue'
import { formatDay, mealLabel, mealOrder } from '@/app/mealLabels'
import { ROUTE } from '@/app/router'
import { useSyncStatus } from '@/app/sync/useSyncStatus'

const players = usePlayerStore()
const journal = useJournalStore()
const history = useConsumptionHistoryStore()
const tracking = useDailyTracking()

async function load(): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await tracking.loadDay(playerId)
}

onMounted(load)

// Un repas coché sur un autre appareil apparaît ici sans recharger la page.
const { remoteRevision } = useSyncStatus()
watch([remoteRevision, () => players.playerId], load)

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
 * Moyenne de la semaine écoulée pour un nutriment, telle que la jauge l'attend.
 * Sans historique lisible ni jour renseigné, rien : mieux vaut pas de moyenne
 * qu'une moyenne inventée.
 */
function averageOf(nutrient: Nutrient) {
  const recent = tracking.recent.value
  return {
    average: recent?.nutrients[nutrient].average ?? null,
    averageDays: recent?.trackedDays ?? 0,
    periodDays: RECENT_DAYS,
  }
}

/** Les jours récents, du plus proche au plus lointain : hier d'abord. */
const recentDays = computed(() => [...(tracking.recent.value?.recentDays ?? [])].reverse())

/** Plafonds, avec l'accord qui convient à chacun. */
const LIMIT_EXCEEDED: ReadonlyArray<readonly [Nutrient, string]> = [
  ['sugarsG', 'sucres dépassés'],
  ['saturatedFatG', 'AG saturés dépassés'],
  ['saltG', 'sel dépassé'],
]

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/**
 * Bilan d'une journée passée, en mots : « déficit » et « excès » plutôt qu'un
 * signe, qui se lit mal et s'entend plus mal encore.
 */
function describeDay(day: DayBalance): string {
  if (day.gap === null) return 'Non renseigné — aucun repas pris, hors de la moyenne'

  const calories = Math.round(day.gap.calories)
  // Même seuil que les jauges : sous le centième du besoin, pas d'écart à dire.
  const habitual = players.needs?.targetCalories ?? 0
  const balance =
    Math.abs(day.gap.calories) < habitual * 0.01
      ? 'À l’équilibre'
      : calories < 0
        ? `Déficit de ${-calories} kcal`
        : `Excès de ${calories} kcal`

  const gap = day.gap
  const exceeded = LIMIT_EXCEEDED.filter(([nutrient]) => gap[nutrient] >= 0.05).map(
    ([nutrient, words]) => `${words} de ${decimal.format(gap[nutrient])} g`,
  )
  return exceeded.length === 0 ? balance : `${balance} · ${exceeded.join(', ')}`
}

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
          v-bind="averageOf('calories')"
        />
        <MacroGauge
          label="Protéines"
          tone="protein"
          :value="consumed.proteinG"
          :target="targets.proteinG"
          v-bind="averageOf('proteinG')"
        />
        <MacroGauge
          label="Glucides"
          tone="carbs"
          :value="consumed.carbsG"
          :target="targets.carbsG"
          v-bind="averageOf('carbsG')"
        />
        <MacroGauge
          label="Lipides"
          tone="fat"
          :value="consumed.fatG"
          :target="targets.fatG"
          v-bind="averageOf('fatG')"
        />
        <MacroGauge
          label="Fibres"
          tone="fiber"
          mode="floor"
          :value="consumedDetail.fiberG"
          :target="references.fiberG"
          v-bind="averageOf('fiberG')"
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
          v-bind="averageOf('sugarsG')"
        />
        <MacroGauge
          label="AG saturés"
          mode="limit"
          :value="consumedDetail.saturatedFatG"
          :target="references.saturatedFatG"
          v-bind="averageOf('saturatedFatG')"
        />
        <MacroGauge
          label="Sel"
          mode="limit"
          :value="consumedDetail.saltG"
          :target="references.saltG"
          v-bind="averageOf('saltG')"
        />
      </div>

      <p
        v-if="plannedCount > 0 || journal.consumedMeals.length === 0"
        class="dashboard__hint"
      >
        Seuls les repas déclarés pris alimentent ces valeurs.
      </p>

      <!--
        Le détail est replié : la jauge dit déjà la moyenne, ceci dit d'où elle
        vient. <details> est accessible au clavier et annonce son état
        replié ou déplié sans aucun ARIA à maintenir.
      -->
      <details
        v-if="recentDays.some((day) => day.tracked)"
        class="dashboard__recent"
      >
        <summary class="dashboard__recent-summary">
          Bilan des {{ RECENT_DAYS }} derniers jours
        </summary>
        <p class="dashboard__hint">
          Les repères nutritionnels se tiennent en moyenne, pas au jour près : les jauges montrent
          donc aussi votre moyenne des {{ RECENT_DAYS }} derniers jours, sans changer l’objectif du
          jour. Une journée sans repas pris n’est pas comptée.
        </p>
        <ul class="dashboard__recent-days">
          <li
            v-for="day in recentDays"
            :key="day.day"
            class="dashboard__recent-day"
            :class="{ 'dashboard__recent-day--untracked': !day.tracked }"
          >
            <span class="dashboard__recent-date">{{ formatDay(day.day) }}</span>
            <span>{{ describeDay(day) }}</span>
          </li>
        </ul>
      </details>
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

.dashboard__recent {
  margin-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

/* Cible tactile de 44px (critère 2.5.8) : un <summary> nu ne fait qu'une ligne. */
.dashboard__recent-summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}

.dashboard__recent-days {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
}

.dashboard__recent-day {
  display: flex;
  flex-direction: column;
}

.dashboard__recent-date {
  font-weight: 600;

  &::first-letter {
    text-transform: uppercase;
  }
}

/* Un jour non renseigné est dit en toutes lettres ; le ton sourd ne fait que
   l'accompagner (critère 1.4.1). */
.dashboard__recent-day--untracked {
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
