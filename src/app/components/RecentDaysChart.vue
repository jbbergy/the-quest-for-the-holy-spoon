<script setup lang="ts">
/**
 * Calories des sept derniers jours, et celles du jour en cours, en barres.
 *
 * Le dessin est **décoratif** (`aria-hidden`) : une liste lue par les lecteurs
 * d'écran donne chaque jour en toutes lettres. Les barres des jours passés
 * prennent la couleur des repères graphiques, celle du jour en cours la
 * couleur de l'action ; la différence est **aussi** écrite (« Auj. » en gras
 * sous la barre, et la légende), jamais portée par la teinte seule.
 *
 * Un jour sans repas mangé n'a pas de barre du tout, plutôt qu'une barre à
 * zéro : il n'entre pas dans la moyenne, et le dessin ne doit pas faire
 * croire à un jeûne.
 */
import { computed } from 'vue'

import { formatDay } from '@/app/mealLabels'
import { type DayKey, dateOfDay } from '@/core/day'
import { dateFormat, numberFormat, t } from '@/i18n'

const props = defineProps<{
  /** Les jours passés, du plus ancien au plus récent ; `null` : aucun repas mangé. */
  days: readonly { readonly day: DayKey; readonly calories: number | null }[]
  today: { readonly day: DayKey; readonly calories: number }
  /** Besoin du jour, dessiné en pointillé. */
  target: number
}>()

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

/** L'échelle laisse de la place au-dessus du besoin, et à la journée la plus haute. */
const scale = computed(() =>
  Math.max(
    props.target * 1.15,
    props.today.calories,
    ...props.days.map((day) => day.calories ?? 0),
  ),
)

const height = (value: number): string => `${Math.min(100, (value / scale.value) * 100)}%`

const bars = computed(() => [
  ...props.days.map((day) => ({
    key: day.day,
    initial: dateFormat({ weekday: 'narrow' }).format(dateOfDay(day.day)),
    calories: day.calories,
    isToday: false,
    spoken:
      day.calories === null
        ? t('dashboard.overview.chart.dayEmpty', { day: formatDay(day.day) })
        : t('dashboard.overview.chart.day', { day: formatDay(day.day), kcal: kcal(day.calories) }),
  })),
  {
    key: props.today.day,
    initial: t('dashboard.overview.chart.todayShort'),
    calories: props.today.calories,
    isToday: true,
    spoken: t('dashboard.overview.chart.today', { kcal: kcal(props.today.calories) }),
  },
])
</script>

<template>
  <div class="chart">
    <ul
      class="sr-only"
      :aria-label="t('dashboard.overview.chart.label', { n: days.length })"
    >
      <li
        v-for="bar in bars"
        :key="bar.key"
      >
        {{ bar.spoken }}
      </li>
    </ul>

    <div
      class="chart__plot"
      aria-hidden="true"
    >
      <span
        class="chart__target"
        :style="{ bottom: height(target) }"
      />
      <span
        v-for="bar in bars"
        :key="bar.key"
        class="chart__bar"
        :class="{ 'chart__bar--today': bar.isToday }"
        :style="{ height: bar.calories === null ? '0' : height(bar.calories) }"
      />
    </div>

    <div
      class="chart__labels"
      aria-hidden="true"
    >
      <span
        v-for="bar in bars"
        :key="bar.key"
        :class="{ 'chart__label--today': bar.isToday }"
      >{{ bar.initial }}</span>
    </div>

    <p
      class="chart__legend"
      aria-hidden="true"
    >
      <span class="chart__legend-line" />
      {{ t('dashboard.overview.chart.legend', { kcal: kcal(target) }) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-4) var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.chart__plot,
.chart__labels {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: var(--space-2);
}

.chart__plot {
  position: relative;
  height: 7.5rem;
  align-items: end;
}

/* Le besoin : pointillé de la bordure active, au moins 3:1 sur la surface. */
.chart__target {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 2px dashed var(--color-border-strong);
}

.chart__bar {
  border-radius: 8px 8px 3px 3px;
  background: var(--color-marker);
  transition: height var(--duration-slow) var(--ease-out);
}

.chart__bar--today {
  background: var(--color-accent);
}

.chart__labels {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}

.chart__label--today {
  color: var(--color-text);
  font-weight: 700;
}

.chart__legend {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.chart__legend-line {
  flex-shrink: 0;
  width: 1.1rem;
  border-top: 2px dashed var(--color-border-strong);
}

@media (forced-colors: active) {
  .chart__bar {
    forced-color-adjust: none;
    background: GrayText;
  }

  .chart__bar--today {
    background: CanvasText;
  }
}
</style>
