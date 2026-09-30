<script setup lang="ts">
/**
 * Apports d'une journée face aux repères, et bilan des sept jours précédents.
 *
 * Dans l'ordre où on les cherche : ce qui reste à manger (l'anneau et un
 * chiffre), les nutriments en barres fines, puis les limites, puis la
 * semaine. Chaque barre a son chiffre écrit à côté ; les barres elles-mêmes
 * sont décoratives. Le détail des moyennes par nutriment, et jour par jour,
 * reste à portée dans une section repliée.
 *
 * Sert à son propre accueil comme à la journée d'un membre du foyer. Le
 * composant ne lit aucun store : tout arrive en props, déjà calculé par les
 * use cases — il affiche, il ne compte pas. L'emplacement `after-calories`
 * reçoit ce qui doit suivre les calories : les repas du jour, puis le conseil.
 * Ses éléments se placent sur la grille par leur classe (`day-meals`,
 * `day-advice`) quand la place permet deux colonnes.
 */
import { computed, useId } from 'vue'

import { GLOSSARY } from '@/app/glossary'
import { formatDay } from '@/app/mealLabels'
import type { DayKey } from '@/core/day'
import type { MacrosProps } from '@/core/nutrition/Macros'
import type { NutrientDetailProps } from '@/core/nutrition/NutrientDetail'
import { lower, numberFormat, t, upperFirst } from '@/i18n'
import {
  type DayBalance,
  type Nutrient,
  RECENT_DAYS,
  type RecentIntake,
} from '@/modules/planning/application'
import type { PlayerNutritionalNeeds } from '@/modules/player_profile/application'
import AppIcon from '@/ui/AppIcon.vue'
import InfoTip from '@/ui/InfoTip.vue'
import MeterBar from '@/ui/MeterBar.vue'
import RingGauge from '@/ui/RingGauge.vue'

import RecentDaysChart from './RecentDaysChart.vue'

const props = defineProps<{
  needs: PlayerNutritionalNeeds
  totalCalories: number
  totalMacros: MacrosProps
  totalDetail: NutrientDetailProps
  recent: RecentIntake | null
  /** Repas prévus mais pas encore mangés ce jour-là. */
  plannedCount: number
  consumedCount: number
  /** Calories des repas prévus, pas encore mangés, et leurs noms (« dîner »). */
  plannedCalories?: number
  plannedMeals?: readonly string[]
  /** Le jour affiché : c'est la dernière barre du graphique de la semaine. */
  day: DayKey
}>()

const ids = { summary: useId(), limits: useId(), recent: useId() }

type Reading = 'target' | 'floor' | 'limit'

interface NutrientLine {
  readonly key: Nutrient
  readonly label: string
  readonly unit: string
  readonly reading: Reading
  readonly tip: string
}

/** L'ordre de lecture : l'énergie, ce qu'il faut atteindre, puis ce qu'il ne faut pas dépasser. */
/**
 * `name` est à la fois la clé du glossaire et celle du libellé. `label` et
 * `tip` sont lus à l'affichage : ils suivent la langue courante.
 */
function nutrientLine(
  key: Nutrient,
  name: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugars' | 'saturatedFat' | 'salt',
  unit: string,
  reading: Reading,
): NutrientLine {
  return {
    key,
    unit,
    reading,
    get label() {
      return t(`labels.nutrient.${name}`)
    },
    get tip() {
      return GLOSSARY[name]
    },
  }
}

const LINES: readonly NutrientLine[] = [
  nutrientLine('calories', 'calories', 'kcal', 'target'),
  nutrientLine('proteinG', 'protein', 'g', 'target'),
  nutrientLine('carbsG', 'carbs', 'g', 'target'),
  nutrientLine('fatG', 'fat', 'g', 'target'),
  nutrientLine('fiberG', 'fiber', 'g', 'floor'),
  nutrientLine('sugarsG', 'sugars', 'g', 'limit'),
  nutrientLine('saturatedFatG', 'saturatedFat', 'g', 'limit'),
  nutrientLine('saltG', 'salt', 'g', 'limit'),
]

const byKey = (key: Nutrient): NutrientLine => LINES.find((line) => line.key === key)!



/** Ce qui a été mangé aujourd'hui, et le repère du jour, nutriment par nutriment. */
function today(key: Nutrient): { readonly value: number; readonly target: number } {
  if (key === 'calories') return { value: props.totalCalories, target: props.needs.targetCalories }
  if (key === 'proteinG' || key === 'carbsG' || key === 'fatG') {
    return { value: props.totalMacros[key], target: props.needs.targetMacros[key] }
  }
  return { value: props.totalDetail[key], target: props.needs.referenceNutrients[key] }
}

/** Les fibres suivent les trois macronutriments : un minimum à atteindre, lu de la même façon. */
const MACROS: readonly Nutrient[] = ['proteinG', 'carbsG', 'fatG', 'fiberG']
const LIMITS: readonly Nutrient[] = ['sugarsG', 'saturatedFatG', 'saltG']

function quantity(value: number, unit: string): string {
  const magnitude = Math.abs(value)
  const digits = unit === 'kcal' || magnitude >= 10 ? 0 : 1
  return `${numberFormat({ maximumFractionDigits: digits }).format(magnitude)} ${unit}`
}

/** Un nombre seul, arrondi comme `quantity` : « 58 », « 4,1 ». */
function figure(value: number, unit: string): string {
  const digits = unit === 'kcal' || Math.abs(value) >= 10 ? 0 : 1
  return numberFormat({ maximumFractionDigits: digits }).format(value)
}

/** « 58 / 90 g » : l'apport du jour, puis son repère. */
function ofTarget(key: Nutrient): { readonly value: string; readonly rest: string } {
  const { value, target } = today(key)
  const unit = byKey(key).unit
  return {
    value: figure(value, unit),
    rest: t('dashboard.overview.ofTarget', { target: figure(target, unit), unit }),
  }
}

/** Ce qui reste à manger, en tête d'écran : un intitulé et un chiffre. */
const energy = computed(() => {
  const gap = props.needs.targetCalories - props.totalCalories
  if (isNegligible(gap, props.needs.targetCalories) || Math.round(gap) === 0) {
    return { label: t('dashboard.overview.reached'), value: null }
  }
  return gap > 0
    ? { label: t('dashboard.overview.remaining'), value: `${figure(gap, 'kcal')} kcal` }
    : { label: t('dashboard.overview.over'), value: t('dashboard.overview.overAmount', { kcal: figure(-gap, 'kcal') }) }
})

/** À partir de 80 % d'une limite, on le dit : ensuite il est trop tard. */
const NEAR_LIMIT = 0.8

/** L'état d'une limite du jour : rien à signaler, presque atteinte, ou dépassée. */
function limitState(key: Nutrient): { readonly tone: 'muted' | 'danger'; readonly note: string | null } {
  const { value, target } = today(key)
  const gap = value - target
  if (gap > 0 && !isNegligible(gap, target)) {
    return { tone: 'danger', note: t('dashboard.overview.limitOver', { amount: quantity(gap, byKey(key).unit) }) }
  }
  if (target > 0 && value / target >= NEAR_LIMIT) {
    return { tone: 'danger', note: t('dashboard.overview.limitNear') }
  }
  return { tone: 'muted', note: null }
}

/** Les jours passés pour le graphique : les calories prises, ou rien. */
const chartDays = computed(() =>
  (props.recent?.recentDays ?? []).map((day) => ({ day: day.day, calories: day.intake?.calories ?? null })),
)

const averageCalories = computed(() => {
  const average = props.recent?.trackedDays ? props.recent.nutrients.calories.average : null
  return average === null ? null : figure(average, 'kcal')
})

/** Sous un centième du repère, un écart n'est pas une information. */
function isNegligible(gap: number, base: number): boolean {
  return Math.abs(gap) < Math.max(base * 0.01, 0.05)
}

/** Un écart dit avec des mots, selon ce que le repère signifie. */
function describeGap(line: NutrientLine, gap: number, base: number): string {
  const amount = quantity(gap, line.unit)
  const negligible = isNegligible(gap, base)
  if (line.reading === 'limit') {
    return gap > 0 && !negligible
      ? t('dashboard.overview.gap.aboveLimit', { amount })
      : t('dashboard.overview.gap.underLimit')
  }
  if (line.reading === 'floor') {
    return gap >= 0 || negligible
      ? t('dashboard.overview.gap.floorReached')
      : t('dashboard.overview.gap.belowFloor', { amount })
  }
  if (negligible) return t('dashboard.overview.gap.atTarget')
  return gap < 0
    ? t('dashboard.overview.gap.belowTarget', { amount })
    : t('dashboard.overview.gap.aboveTarget', { amount })
}

/** Moyennes de la semaine écoulée, en phrases. `null` sans aucun jour renseigné. */
const weekLines = computed(() => {
  const recent = props.recent
  if (recent === null || recent.trackedDays === 0) return null
  return LINES.map((line) => {
    const average = recent.nutrients[line.key]
    return {
      key: line.key,
      label: line.label,
      average: average.average === null ? '' : quantity(average.average, line.unit),
      verdict: average.gap === null ? '' : describeGap(line, average.gap, average.base),
    }
  })
})

const trackedDays = computed(() => props.recent?.trackedDays ?? 0)

/** Les jours récents, du plus proche au plus lointain : hier d'abord. */
const recentDays = computed(() => [...(props.recent?.recentDays ?? [])].reverse())

/** Première lettre en majuscule : chaque morceau devient une phrase. */
function sentence(text: string): string {
  return `${upperFirst(text)}.`
}

/** Une journée passée, en une ou deux phrases courtes. */
function describeDay(day: DayBalance): string {
  const gap = day.gap
  if (gap === null) return t('dashboard.overview.noMealEaten')

  const energy = describeGap(byKey('calories'), gap.calories, props.needs.targetCalories)
  const over = LIMITS.filter((key) => gap[key] >= 0.05).map((key) => lower(byKey(key).label))
  return over.length === 0
    ? sentence(energy)
    : `${sentence(energy)} ${sentence(t('dashboard.overview.overLimits', { list: over.join(', ') }))}`
}
</script>

<template>
  <div class="day-frame">
    <div class="day">
      <section
        class="day__summary"
        :aria-labelledby="ids.summary"
      >
        <div class="day__energy">
          <RingGauge
            :label="t('labels.nutrient.calories')"
            unit="kcal"
            compact
            :value="totalCalories"
            :target="needs.targetCalories"
          />
          <div class="day__remaining">
            <h2
              :id="ids.summary"
              class="day__remaining-label"
            >
              {{ energy.label }}<InfoTip
                :term="t('labels.term.need')"
                :text="GLOSSARY.needs"
              />
            </h2>
            <p
              v-if="energy.value"
              class="day__remaining-value figure"
            >
              {{ energy.value }}
            </p>
            <p
              v-if="(plannedCalories ?? 0) > 0"
              class="day__hint"
            >
              {{ t('dashboard.overview.stillPlanned', { kcal: figure(plannedCalories ?? 0, 'kcal'), meals: (plannedMeals ?? []).join(', ') }) }}
            </p>
            <p
              v-else-if="consumedCount === 0"
              class="day__hint"
            >
              {{ t('dashboard.overview.onlyEaten') }}
            </p>
          </div>
        </div>

        <ul
          class="day__macros"
          :aria-label="t('dashboard.overview.macrosLabel')"
        >
          <li
            v-for="key in MACROS"
            :key="key"
            class="day__macro"
          >
            <span class="day__macro-label">
              {{ byKey(key).label }}<InfoTip
                :term="byKey(key).label"
                :text="byKey(key).tip"
              />
            </span>
            <span class="day__macro-figure"><strong>{{ ofTarget(key).value }}</strong> {{ ofTarget(key).rest }}</span>
            <MeterBar
              :value="today(key).value"
              :target="today(key).target"
            />
          </li>
        </ul>
      </section>

      <slot name="after-calories" />

      <section
        class="day__limits"
        :aria-labelledby="ids.limits"
      >
        <h2 :id="ids.limits">
          {{ t('dashboard.overview.limitsTitle') }}
        </h2>
        <ul class="day__limit-list">
          <li
            v-for="key in LIMITS"
            :key="key"
            class="day__limit"
          >
            <span class="day__limit-label">
              {{ byKey(key).label }}<InfoTip
                :term="byKey(key).label"
                :text="byKey(key).tip"
              />
            </span>
            <span
              class="day__limit-figure"
              :class="{ 'day__limit-figure--alert': limitState(key).tone === 'danger' }"
            >
              <strong>{{ ofTarget(key).value }}</strong> {{ ofTarget(key).rest }}<template v-if="limitState(key).note"> · {{ limitState(key).note }}</template>
            </span>
            <MeterBar
              class="day__limit-bar"
              :value="today(key).value"
              :target="today(key).target"
              :tone="limitState(key).tone"
            />
          </li>
        </ul>
      </section>

      <section
        class="day__recent"
        :aria-labelledby="ids.recent"
      >
        <div class="day__recent-head">
          <h2 :id="ids.recent">
            {{ t('dashboard.overview.recentTitle', { n: RECENT_DAYS }) }}<InfoTip
              :term="t('dashboard.overview.recentTitle', { n: RECENT_DAYS })"
              :text="GLOSSARY.weekAverage"
            />
          </h2>
          <p
            v-if="averageCalories"
            class="day__hint"
          >
            {{ t('dashboard.overview.averageKcal', { kcal: averageCalories }) }}
          </p>
        </div>

        <p
          v-if="weekLines === null"
          class="day__hint"
        >
          {{ t('dashboard.overview.noRecent') }}
        </p>

        <RecentDaysChart
          :days="chartDays"
          :today="{ day, calories: totalCalories }"
          :target="needs.targetCalories"
        />

        <!--
          <details> s'ouvre au clavier et annonce son état, sans ARIA à
          maintenir : le détail ne s'impose pas à qui n'en veut pas.
        -->
        <details
          v-if="weekLines !== null"
          class="day__details"
        >
          <summary class="day__details-summary">
            {{ t('dashboard.overview.nutrientAverages') }}
            <AppIcon
              name="chevron-down"
              class="day__details-chevron"
            />
          </summary>
          <p class="day__hint">
            {{ t('dashboard.overview.averagePerDay', { n: trackedDays }) }}
          </p>
          <ul class="day__week">
            <li
              v-for="line in weekLines"
              :key="line.key"
              class="day__week-line"
            >
              <span class="day__week-label">{{ line.label }}</span>
              <span class="day__week-figure">{{ line.average }}</span>
              <span class="day__week-verdict">{{ line.verdict }}</span>
            </li>
          </ul>
          <details class="day__details day__details--nested">
            <summary class="day__details-summary">
              {{ t('dashboard.overview.dayByDay') }}
              <AppIcon
                name="chevron-down"
                class="day__details-chevron"
              />
            </summary>
            <ul class="day__days">
              <li
                v-for="balance in recentDays"
                :key="balance.day"
                class="day__past"
                :class="{ 'day__past--untracked': !balance.tracked }"
              >
                <span class="day__past-date">{{ formatDay(balance.day) }}</span>
                <span>{{ describeDay(balance) }}</span>
              </li>
            </ul>
          </details>
        </details>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Le cadre mesure la place réellement disponible : deux colonnes dès qu'elle
   le permet, quelle que soit la taille de la fenêtre. */
.day-frame {
  container-type: inline-size;
}

.day {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.day h2 {
  margin: 0;
}

/* L'aide « ? » garde la taille du texte courant, pas celle du titre en serif. */
.day h2 :deep(.tip__button) {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.day__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Synthèse : l'anneau, ce qui reste, puis les nutriments. */
.day__summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.day__energy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
}

.day__remaining {
  display: flex;
  flex: 1 1 7.5rem;
  flex-direction: column;
  gap: var(--space-1);
}

.day .day__remaining-label {
  color: var(--color-text-muted);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  letter-spacing: normal;
}

.day__remaining-value {
  margin: 0;
  font-size: clamp(1.75rem, 9cqi, var(--font-size-display));
  line-height: 1.05;
  white-space: nowrap;
}

.day__summary {
  container-type: inline-size;
}

.day__macros {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4) var(--space-3);
}

.day__macro {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.day__macro-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.day__macro-figure {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;

  strong {
    color: var(--color-text);
  }
}

/* Limites : intitulé à gauche, chiffre à droite, barre dessous. */
.day__limits {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.day__limit-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.day__limit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-1) var(--space-3);
  align-items: baseline;
}

.day__limit-label {
  font-weight: 700;
}

.day__limit-figure {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* Une limite presque atteinte : Tomate **et** les mots qui le disent. */
.day__limit-figure strong {
  color: var(--color-text);
}

.day__limit-figure--alert,
.day__limit-figure--alert strong {
  color: var(--color-danger);
  font-weight: 700;
}

.day__limit-bar {
  grid-column: 1 / -1;
}

.day__recent {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.day__recent-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-3);
}

.day__details {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.day__details--nested {
  margin-top: var(--space-2);
}

/* Cible tactile de 44 px (critère 2.5.8) : un <summary> nu ne fait qu'une ligne.
   En `flex`, il perd son triangle : le chevron le remplace, et pivote à
   l'ouverture ; l'état ouvert ou fermé est annoncé par l'élément natif. */
.day__details-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  color: var(--color-accent);
  font-weight: 700;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }
}

.day__details-chevron {
  transition: transform var(--duration-fast) var(--ease-out);
}

.day__details[open] > .day__details-summary .day__details-chevron {
  transform: rotate(180deg);
}

.day__week {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.day__week-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-divider);
}

.day__week-label {
  font-weight: 700;
}

.day__week-figure {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.day__week-verdict {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.day__days {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.day__past {
  display: flex;
  flex-direction: column;
}

.day__past-date {
  font-weight: 700;

  &::first-letter {
    text-transform: uppercase;
  }
}

/* Un jour sans repas est dit en toutes lettres ; le ton sourd ne fait que
   l'accompagner (critère 1.4.1). */
.day__past--untracked {
  color: var(--color-text-muted);
}

/* Mesuré sur la carte : quatre colonnes seulement quand chacune a la place
   de « 150 / 260 g » sur une ligne. */
@container (width >= 32rem) {
  .day__macros {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Grand écran : la synthèse et la semaine à gauche, les repas à droite, puis
   les limites et le conseil côte à côte. L'ordre de lecture ne change pas. */
@container (width >= 56rem) {
  .day {
    display: grid;
    grid-template-columns: 5fr 4fr 3fr;
    grid-template-areas:
      'summary meals meals'
      'recent limits advice';
    align-items: start;
    gap: var(--space-6);
  }

  .day__summary {
    grid-area: summary;
    padding: var(--space-6);
  }

  .day__limits {
    grid-area: limits;
  }

  .day__recent {
    grid-area: recent;
  }

  .day :slotted(.day-meals) {
    grid-area: meals;
  }

  .day :slotted(.day-advice) {
    grid-area: advice;
  }
}
</style>
