<script setup lang="ts">
/**
 * Apports d'une journée face aux repères, en grille de tuiles (« bento »), et
 * bilan des sept jours précédents.
 *
 * Une tuile par information, un anneau par nutriment : on voit d'un coup
 * d'œil où en est la journée, et l'on ne lit le détail que si l'on veut. La
 * moyenne de la semaine a sa propre tuile — la répéter sous chaque jauge
 * faisait huit phrases chiffrées avant d'arriver aux repas.
 *
 * Sert à son propre accueil comme à la journée d'un membre du foyer. Le
 * composant ne lit aucun store : tout arrive en props, déjà calculé par les
 * use cases — il affiche, il ne compte pas. L'emplacement `after-calories`
 * reçoit ce qui doit suivre les calories : les repas du jour.
 */
import { computed } from 'vue'

import { GLOSSARY } from '@/app/glossary'
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
import BentoTile from '@/ui/BentoTile.vue'
import InfoTip from '@/ui/InfoTip.vue'
import RingGauge from '@/ui/RingGauge.vue'

const props = defineProps<{
  needs: PlayerNutritionalNeeds
  totalCalories: number
  totalMacros: MacrosProps
  totalDetail: NutrientDetailProps
  recent: RecentIntake | null
  /** Repas prévus mais pas encore mangés ce jour-là. */
  plannedCount: number
  consumedCount: number
}>()

type Reading = 'target' | 'floor' | 'limit'

interface NutrientLine {
  readonly key: Nutrient
  readonly label: string
  readonly unit: string
  readonly reading: Reading
  readonly tip: string
}

/** L'ordre de lecture : l'énergie, ce qu'il faut atteindre, puis ce qu'il ne faut pas dépasser. */
const LINES: readonly NutrientLine[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal', reading: 'target', tip: GLOSSARY.calories },
  { key: 'proteinG', label: 'Protéines', unit: 'g', reading: 'target', tip: GLOSSARY.protein },
  { key: 'carbsG', label: 'Glucides', unit: 'g', reading: 'target', tip: GLOSSARY.carbs },
  { key: 'fatG', label: 'Lipides', unit: 'g', reading: 'target', tip: GLOSSARY.fat },
  { key: 'fiberG', label: 'Fibres', unit: 'g', reading: 'floor', tip: GLOSSARY.fiber },
  { key: 'sugarsG', label: 'Sucres', unit: 'g', reading: 'limit', tip: GLOSSARY.sugars },
  {
    key: 'saturatedFatG',
    label: 'Graisses saturées',
    unit: 'g',
    reading: 'limit',
    tip: GLOSSARY.saturatedFat,
  },
  { key: 'saltG', label: 'Sel', unit: 'g', reading: 'limit', tip: GLOSSARY.salt },
]

const byKey = (key: Nutrient): NutrientLine => LINES.find((line) => line.key === key)!

function toneOf(key: Nutrient): 'protein' | 'carbs' | 'fat' | 'fiber' | 'accent' {
  if (key === 'proteinG') return 'protein'
  if (key === 'carbsG') return 'carbs'
  if (key === 'fatG') return 'fat'
  return key === 'fiberG' ? 'fiber' : 'accent'
}

/** Moyenne des jours précédents pour l'anneau ; `null` sans jour renseigné. */
function averageOf(key: Nutrient): number | null {
  if (props.recent === null || props.recent.trackedDays === 0) return null
  return props.recent.nutrients[key].average
}

/** Ce qui a été mangé aujourd'hui, et le repère du jour, nutriment par nutriment. */
function today(key: Nutrient): { readonly value: number; readonly target: number } {
  if (key === 'calories') return { value: props.totalCalories, target: props.needs.targetCalories }
  if (key === 'proteinG' || key === 'carbsG' || key === 'fatG') {
    return { value: props.totalMacros[key], target: props.needs.targetMacros[key] }
  }
  return { value: props.totalDetail[key], target: props.needs.referenceNutrients[key] }
}

const MACROS: readonly Nutrient[] = ['proteinG', 'carbsG', 'fatG', 'fiberG']
const LIMITS: readonly Nutrient[] = ['sugarsG', 'saturatedFatG', 'saltG']

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

function quantity(value: number, unit: string): string {
  const magnitude = Math.abs(value)
  const format = unit === 'kcal' || magnitude >= 10 ? whole : decimal
  return `${format.format(magnitude)} ${unit}`
}

/** Sous un centième du repère, un écart n'est pas une information. */
function isNegligible(gap: number, base: number): boolean {
  return Math.abs(gap) < Math.max(base * 0.01, 0.05)
}

/** Un écart dit avec des mots, selon ce que le repère signifie. */
function describeGap(line: NutrientLine, gap: number, base: number): string {
  const amount = quantity(gap, line.unit)
  const negligible = isNegligible(gap, base)
  if (line.reading === 'limit') {
    return gap > 0 && !negligible ? `${amount} au-dessus de la limite` : 'sous la limite'
  }
  if (line.reading === 'floor') {
    return gap >= 0 || negligible ? 'minimum atteint' : `${amount} de moins que le minimum`
  }
  if (negligible) return 'au niveau du besoin'
  return gap < 0 ? `${amount} de moins que le besoin` : `${amount} de plus que le besoin`
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
  return `${text.charAt(0).toLocaleUpperCase('fr-FR')}${text.slice(1)}.`
}

/** Une journée passée, en une ou deux phrases courtes. */
function describeDay(day: DayBalance): string {
  const gap = day.gap
  if (gap === null) return 'Aucun repas mangé : ce jour ne compte pas dans la moyenne.'

  const energy = describeGap(byKey('calories'), gap.calories, props.needs.targetCalories)
  const over = LIMITS.filter((key) => gap[key] >= 0.05).map((key) =>
    byKey(key).label.toLocaleLowerCase('fr-FR'),
  )
  return over.length === 0
    ? sentence(energy)
    : `${sentence(energy)} ${sentence(`${over.join(', ')} : au-dessus de la limite`)}`
}
</script>

<template>
  <div class="bento">
    <BentoTile
      title="Calories"
      :tip="GLOSSARY.calories"
      wide
    >
      <div class="bento__calories">
        <RingGauge
          label="Calories"
          unit="kcal"
          size="lg"
          :value="totalCalories"
          :target="needs.targetCalories"
          :average="averageOf('calories')"
        />
        <p class="bento__hint">
          Votre besoin pour la journée : <strong>{{ Math.round(needs.targetCalories) }} kcal</strong>.<InfoTip
            term="besoin"
            :text="GLOSSARY.needs"
          />
        </p>
        <p
          v-if="plannedCount > 0 || consumedCount === 0"
          class="bento__hint"
        >
          Seuls les repas mangés comptent.
        </p>
      </div>
    </BentoTile>

    <slot name="after-calories" />

    <BentoTile
      v-for="key in MACROS"
      :key="key"
      :title="byKey(key).label"
      :tip="byKey(key).tip"
    >
      <RingGauge
        :label="byKey(key).label"
        :tone="toneOf(key)"
        :mode="byKey(key).reading === 'floor' ? 'floor' : 'target'"
        :value="today(key).value"
        :target="today(key).target"
        :average="averageOf(key)"
      />
    </BentoTile>

    <BentoTile
      title="À ne pas dépasser"
      subtitle="Il vaut mieux rester sous ces limites."
      wide
    >
      <div class="bento__limits">
        <div
          v-for="key in LIMITS"
          :key="key"
          class="bento__limit"
        >
          <h3 class="bento__limit-title">
            {{ byKey(key).label }}<InfoTip
              :term="byKey(key).label"
              :text="byKey(key).tip"
            />
          </h3>
          <RingGauge
            :label="byKey(key).label"
            mode="limit"
            :value="today(key).value"
            :target="today(key).target"
            :average="averageOf(key)"
          />
        </div>
      </div>
    </BentoTile>

    <BentoTile
      :title="`Ces ${RECENT_DAYS} derniers jours`"
      :tip="GLOSSARY.weekAverage"
      wide
    >
      <p
        v-if="weekLines === null"
        class="bento__hint"
      >
        Pas encore de jour à comparer. Cochez « Mangé » sur vos repas : la moyenne apparaîtra
        ici dès demain.
      </p>
      <template v-else>
        <p class="bento__hint">
          Moyenne par jour, sur {{ trackedDays }} jour{{ trackedDays > 1 ? 's' : '' }} avec des
          repas mangés.
        </p>
        <ul class="bento__week">
          <li
            v-for="line in weekLines"
            :key="line.key"
            class="bento__week-line"
          >
            <span class="bento__week-label">{{ line.label }}</span>
            <span class="bento__week-figure">{{ line.average }}</span>
            <span class="bento__week-verdict">{{ line.verdict }}</span>
          </li>
        </ul>
        <!--
          <details> s'ouvre au clavier et annonce son état, sans ARIA à
          maintenir : le détail jour par jour ne s'impose pas à qui n'en veut pas.
        -->
        <details class="bento__days">
          <summary class="bento__days-summary">
            Voir jour par jour
          </summary>
          <ul class="bento__days-list">
            <li
              v-for="day in recentDays"
              :key="day.day"
              class="bento__day"
              :class="{ 'bento__day--untracked': !day.tracked }"
            >
              <span class="bento__day-date">{{ formatDay(day.day) }}</span>
              <span>{{ describeDay(day) }}</span>
            </li>
          </ul>
        </details>
      </template>
    </BentoTile>
  </div>
</template>

<style scoped lang="scss">
.bento {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

/* Assez de place : les quatre nutriments tiennent sur une rangée. */
@media (width >= 40rem) {
  .bento {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.bento__calories {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.bento__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.bento__hint strong {
  color: var(--color-text);
}

.bento__limits {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
  gap: var(--space-3);
}

.bento__limit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.bento__limit-title {
  margin: 0;
  font-size: var(--font-size-sm);
  text-align: center;
}

.bento__week {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bento__week-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.bento__week-label {
  font-weight: 600;
}

.bento__week-figure {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.bento__week-verdict {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Cible tactile de 44 px (critère 2.5.8) : un <summary> nu ne fait qu'une ligne. */
.bento__days-summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}

.bento__days-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.bento__day {
  display: flex;
  flex-direction: column;
}

.bento__day-date {
  font-weight: 600;

  &::first-letter {
    text-transform: uppercase;
  }
}

/* Un jour sans repas est dit en toutes lettres ; le ton sourd ne fait que
   l'accompagner (critère 1.4.1). */
.bento__day--untracked {
  color: var(--color-text-muted);
}
</style>
