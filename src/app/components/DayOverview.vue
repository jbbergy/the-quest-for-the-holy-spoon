<script setup lang="ts">
/**
 * Apports d'une journée face aux repères, et bilan des sept jours précédents.
 *
 * Extrait du tableau de bord pour servir aussi à consulter la journée d'un
 * membre du foyer. Le composant ne lit aucun store : tout arrive en props,
 * déjà calculé par les use cases — il affiche, il ne compte pas.
 */
import { computed } from 'vue'

import { formatDay } from '@/app/mealLabels'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import {
  type DayBalance,
  type Nutrient,
  RECENT_DAYS,
  type RecentIntake,
} from '@/modules/planning/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'
import BaseCard from '@/ui/BaseCard.vue'
import MacroGauge from '@/ui/MacroGauge.vue'

const props = withDefaults(
  defineProps<{
    needs: PlayerNutritionalNeeds
    totalCalories: number
    totalMacros: MacrosProps
    totalDetail: NutrientDetailProps
    recent: RecentIntake | null
    /** Repas composés mais pas encore pris ce jour-là. */
    plannedCount: number
    consumedCount: number
    title?: string
    /** Le bilan parle de qui l'on regarde : soi, ou un membre du foyer. */
    whose?: 'self' | 'member'
  }>(),
  { title: 'Apports du jour', whose: 'self' },
)

/**
 * Moyenne de la semaine écoulée pour un nutriment, telle que la jauge l'attend.
 * Sans historique lisible ni jour renseigné, rien : mieux vaut pas de moyenne
 * qu'une moyenne inventée.
 */
function averageOf(nutrient: Nutrient) {
  return {
    average: props.recent?.nutrients[nutrient].average ?? null,
    averageDays: props.recent?.trackedDays ?? 0,
    periodDays: RECENT_DAYS,
  }
}

/** Les jours récents, du plus proche au plus lointain : hier d'abord. */
const recentDays = computed(() => [...(props.recent?.recentDays ?? [])].reverse())

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
  const balance =
    Math.abs(day.gap.calories) < props.needs.targetCalories * 0.01
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
</script>

<template>
  <!--
    Une seule carte pour toute la journée nutritionnelle : les apports et les
    repères ne se lisent pas séparément, on regarde ce qu'il reste à prendre
    et ce qu'on a déjà trop pris d'un même coup d'œil.

    Les fibres figurent avec les macros parce qu'elles sont, comme elles, un
    apport à atteindre. Seul le sens de lecture — objectif ou plafond —
    justifie une séparation, d'où le sous-titre plutôt qu'une seconde carte.
  -->
  <BaseCard
    :title="title"
    :subtitle="`${Math.round(totalCalories)} sur ${Math.round(needs.targetCalories)} kcal`"
  >
    <div class="overview__gauges">
      <MacroGauge
        label="Calories"
        unit="kcal"
        :value="totalCalories"
        :target="needs.targetCalories"
        v-bind="averageOf('calories')"
      />
      <MacroGauge
        label="Protéines"
        tone="protein"
        :value="totalMacros.proteinG"
        :target="needs.targetMacros.proteinG"
        v-bind="averageOf('proteinG')"
      />
      <MacroGauge
        label="Glucides"
        tone="carbs"
        :value="totalMacros.carbsG"
        :target="needs.targetMacros.carbsG"
        v-bind="averageOf('carbsG')"
      />
      <MacroGauge
        label="Lipides"
        tone="fat"
        :value="totalMacros.fatG"
        :target="needs.targetMacros.fatG"
        v-bind="averageOf('fatG')"
      />
      <MacroGauge
        label="Fibres"
        tone="fiber"
        mode="floor"
        :value="totalDetail.fiberG"
        :target="needs.referenceNutrients.fiberG"
        v-bind="averageOf('fiberG')"
      />
    </div>

    <h3 class="overview__subhead">
      À ne pas dépasser
    </h3>
    <div class="overview__gauges">
      <MacroGauge
        label="Sucres"
        mode="limit"
        :value="totalDetail.sugarsG"
        :target="needs.referenceNutrients.sugarsG"
        v-bind="averageOf('sugarsG')"
      />
      <MacroGauge
        label="AG saturés"
        mode="limit"
        :value="totalDetail.saturatedFatG"
        :target="needs.referenceNutrients.saturatedFatG"
        v-bind="averageOf('saturatedFatG')"
      />
      <MacroGauge
        label="Sel"
        mode="limit"
        :value="totalDetail.saltG"
        :target="needs.referenceNutrients.saltG"
        v-bind="averageOf('saltG')"
      />
    </div>

    <p
      v-if="plannedCount > 0 || consumedCount === 0"
      class="overview__hint"
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
      class="overview__recent"
    >
      <summary class="overview__recent-summary">
        Bilan des {{ RECENT_DAYS }} derniers jours
      </summary>
      <p class="overview__hint">
        Les repères nutritionnels se tiennent en moyenne, pas au jour près : les jauges montrent
        donc aussi {{ whose === 'self' ? 'votre' : 'sa' }} moyenne des {{ RECENT_DAYS }} derniers
        jours, sans changer l’objectif du jour. Une journée sans
        repas pris n’est pas comptée.
      </p>
      <ul class="overview__recent-days">
        <li
          v-for="day in recentDays"
          :key="day.day"
          class="overview__recent-day"
          :class="{ 'overview__recent-day--untracked': !day.tracked }"
        >
          <span class="overview__recent-date">{{ formatDay(day.day) }}</span>
          <span>{{ describeDay(day) }}</span>
        </li>
      </ul>
    </details>
  </BaseCard>
</template>

<style scoped lang="scss">
.overview__gauges {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Sépare les plafonds des objectifs sans couper la carte en deux : c'est un
   changement de sens de lecture, pas un autre sujet. */
.overview__subhead {
  margin: var(--space-5) 0 var(--space-3);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.overview__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.overview__recent {
  margin-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

/* Cible tactile de 44px (critère 2.5.8) : un <summary> nu ne fait qu'une ligne. */
.overview__recent-summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}

.overview__recent-days {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
}

.overview__recent-day {
  display: flex;
  flex-direction: column;
}

.overview__recent-date {
  font-weight: 600;

  &::first-letter {
    text-transform: uppercase;
  }
}

/* Un jour non renseigné est dit en toutes lettres ; le ton sourd ne fait que
   l'accompagner (critère 1.4.1). */
.overview__recent-day--untracked {
  color: var(--color-text-muted);
}
</style>
