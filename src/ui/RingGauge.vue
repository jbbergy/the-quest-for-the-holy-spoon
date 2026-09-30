<script setup lang="ts">
/**
 * Jauge circulaire d'un nutriment ou des calories.
 *
 * Trois sens de lecture, parce que tous les repères ne se lisent pas pareil :
 *
 * - `target` — un **besoin** à atteindre (calories, protéines, glucides,
 *   lipides). L'anneau plein est le but ; le dépasser se signale.
 * - `floor` — un **minimum** (les fibres). Le dépasser n'est pas un excès.
 * - `limit` — une **limite** à ne pas dépasser (sucres, graisses saturées,
 *   sel). L'anneau reste sourd tant qu'il se remplit : il ne doit pas avoir
 *   l'air d'une progression à encourager. Il ne passe au rouge qu'une fois la
 *   limite franchie.
 *
 * Deux repères sur l'anneau, dont le tour complet vaut le besoin, le minimum
 * ou la limite :
 *
 * - au-delà, un **second tour**, plus foncé, montre de combien on le dépasse
 *   (jusqu'au double ; le texte donne le chiffre exact) ;
 * - avec `average`, un **trait** marque la moyenne des jours précédents, et une
 *   ligne de légende la chiffre sous l'anneau.
 *
 * Accessibilité : `role="progressbar"` et ses valeurs ARIA, **et** un
 * `aria-valuetext` en toutes lettres (« Sel : 4 g, limite 5 g. Sous la
 * limite. »), moyenne comprise. Sous l'anneau, une phrase dit l'état — « Encore
 * 23 g », « Limite dépassée » — pour que la couleur ne soit jamais le seul
 * indice (critère 1.4.1). Les traits ne sont que des repères visuels : tout ce
 * qu'ils montrent est aussi écrit.
 */
import { computed } from 'vue'

import { numberFormat, t } from '@/i18n'

import { useAnimatedNumber } from './useAnimatedNumber'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    target: number
    unit?: string
    tone?: 'protein' | 'carbs' | 'fat' | 'fiber' | 'accent'
    mode?: 'target' | 'floor' | 'limit'
    size?: 'md' | 'lg'
    /** Apport moyen par jour sur les jours précédents ; `null` : pas de trait. */
    average?: number | null
  }>(),
  {
    unit: 'g',
    tone: 'accent',
    mode: 'target',
    size: 'md',
    average: null,
  },
)

/** Sans séparateur de milliers : « 2298 » se lit mieux que « 2 298 » dans un anneau étroit. */
const amountFormat = () => numberFormat({ maximumFractionDigits: 1, useGrouping: false })

/** Une décimale sous 10 g — le sel se joue au dixième —, aucune au-delà ni pour les kcal. */
function amount(value: number): string {
  const magnitude = Math.abs(value)
  const precise = props.unit !== 'kcal' && magnitude < 10
  return amountFormat().format(precise ? Math.round(magnitude * 10) / 10 : Math.round(magnitude))
}

/** Sous un centième du repère, un écart n'est pas une information. */
const NEGLIGIBLE_SHARE = 0.01

const ratio = computed(() => (props.target <= 0 ? 0 : Math.min(1, props.value / props.target)))
const gap = computed(() => props.value - props.target)
const negligible = computed(
  () => amount(gap.value) === '0' || Math.abs(gap.value) < props.target * NEGLIGIBLE_SHARE,
)
const isExceeded = computed(() => props.target > 0 && gap.value > 0 && !negligible.value)

/** L'état, en mots courts : c'est lui qui porte l'information, pas la couleur. */
const status = computed(() => {
  const rest = `${amount(gap.value)} ${props.unit}`
  if (props.mode === 'limit') {
    return isExceeded.value ? t('ui.gauge.limitExceeded', { rest }) : t('ui.gauge.underLimit')
  }
  if (props.mode === 'floor') {
    return gap.value >= 0 || negligible.value
      ? t('ui.gauge.floorReached')
      : t('ui.gauge.remaining', { rest })
  }
  if (negligible.value) return t('ui.gauge.targetReached')
  return gap.value < 0 ? t('ui.gauge.remaining', { rest }) : t('ui.gauge.overTarget', { rest })
})

/** Ce que l'anneau compare : « sur 2298 kcal », « au moins 30 g », « 5 g au plus ». */
const reference = computed(() => {
  const bound = `${Math.round(props.target)} ${props.unit}`
  if (props.mode === 'limit') return t('ui.gauge.limitOf', { bound })
  if (props.mode === 'floor') return t('ui.gauge.atLeast', { bound })
  return t('ui.gauge.outOf', { bound })
})

const averageText = computed(() =>
  props.average === null
    ? null
    : t('ui.gauge.averageSpoken', { value: amount(props.average), unit: props.unit }),
)

const valueText = computed(() => {
  const head = t('ui.gauge.spoken', {
    label: props.label,
    value: amount(props.value),
    unit: props.unit,
    reference: reference.value,
    status: status.value,
  })
  return averageText.value === null ? head : `${head} ${averageText.value}.`
})

const animatedValue = useAnimatedNumber(() => props.value)
const animatedRatio = useAnimatedNumber(() => ratio.value)

/** Longueur de l'anneau, pour `stroke-dasharray` : 2πr avec r = 42. */
const CIRCUMFERENCE = 2 * Math.PI * 42
const dash = computed(() => `${(animatedRatio.value * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE}`)

/** Le second tour : la part au-delà du repère, plafonnée à un tour complet. */
const overflowRatio = computed(() =>
  props.target <= 0 ? 0 : Math.min(1, Math.max(0, props.value / props.target - 1)),
)
const animatedOverflow = useAnimatedNumber(() => overflowRatio.value)
const overflowDash = computed(
  () => `${(animatedOverflow.value * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE}`,
)

/**
 * Le trait de la moyenne, en coordonnées de l'anneau (rotation déjà appliquée
 * au SVG : 0 est en haut). Au-delà du repère, il reste au cran : le texte
 * donne le chiffre.
 */
const averageTick = computed(() => {
  if (props.average === null || props.target <= 0) return null
  const angle = Math.min(1, Math.max(0, props.average / props.target)) * 2 * Math.PI
  const point = (radius: number) => ({
    x: (50 + radius * Math.cos(angle)).toFixed(2),
    y: (50 + radius * Math.sin(angle)).toFixed(2),
  })
  return { from: point(34), to: point(50) }
})
</script>

<template>
  <div
    class="ring"
    :class="[`ring--${tone}`, `ring--${mode}`, `ring--${size}`, { 'ring--exceeded': isExceeded }]"
  >
    <div
      class="ring__dial"
      role="progressbar"
      :aria-label="label"
      :aria-valuenow="Math.round(value)"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(target)"
      :aria-valuetext="valueText"
    >
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          class="ring__track"
          cx="50"
          cy="50"
          r="42"
        />
        <circle
          class="ring__fill"
          cx="50"
          cy="50"
          r="42"
          :stroke-dasharray="dash"
        />
        <circle
          v-if="overflowRatio > 0"
          class="ring__overflow"
          cx="50"
          cy="50"
          r="42"
          :stroke-dasharray="overflowDash"
        />
        <line
          v-if="averageTick"
          class="ring__average"
          :x1="averageTick.from.x"
          :y1="averageTick.from.y"
          :x2="averageTick.to.x"
          :y2="averageTick.to.y"
        />
      </svg>
      <span
        class="ring__center"
        aria-hidden="true"
      >
        <strong class="ring__value">{{ amount(animatedValue) }}</strong>
        <span class="ring__unit">{{ unit }}</span>
      </span>
    </div>
    <p
      class="ring__reference"
      aria-hidden="true"
    >
      {{ reference }}
    </p>
    <p
      class="ring__status"
      aria-hidden="true"
    >
      <span
        v-if="isExceeded"
        class="ring__alert"
      >!</span>
      {{ status }}
    </p>
    <p
      v-if="average !== null"
      class="ring__legend"
      aria-hidden="true"
    >
      <span class="ring__swatch" />
      {{ t('ui.gauge.average', { value: amount(average), unit }) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.ring {
  --ring-color: var(--color-accent);

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
}

.ring--protein {
  --ring-color: var(--color-protein);
}

.ring--carbs {
  --ring-color: var(--color-carbs);
}

.ring--fat {
  --ring-color: var(--color-fat);
}

.ring--fiber {
  --ring-color: var(--color-fiber);
}

/* Une limite n'est pas une cible : ton sourd tant qu'elle n'est pas franchie. */
.ring--limit {
  --ring-color: var(--color-text-muted);
}

/* Après `--limit` : le dépassement l'emporte, quel que soit l'ordre des classes. */
.ring--exceeded {
  --ring-color: var(--color-danger);
}

.ring__dial {
  position: relative;
  width: 6.5rem;
  aspect-ratio: 1;
}

.ring--lg .ring__dial {
  width: 9.5rem;
}

.ring__dial svg {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring__track,
.ring__fill,
.ring__overflow {
  fill: none;
  stroke-width: 9;
}

.ring__dial svg {
  overflow: visible;
}

/* Le second tour, plus foncé : on voit qu'on a fait le tour, et de combien. */
.ring__overflow {
  stroke: color-mix(in srgb, var(--ring-color) 55%, var(--color-text));
  stroke-linecap: round;
}

/* Le trait de la moyenne dépasse de l'anneau, couleur du texte et liseré du
   fond : contraste d'au moins 3:1 contre la piste comme contre le
   remplissage (critère 1.4.11). */
.ring__average {
  stroke: var(--color-text);
  stroke-width: 3;
  stroke-linecap: round;
  paint-order: stroke;
  filter: drop-shadow(0 0 1px var(--color-bg));
}

.ring__track {
  stroke: var(--color-track);
}

.ring__fill {
  stroke: var(--ring-color);
  stroke-linecap: round;
}

.ring__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;

  /* Chiffres à chasse fixe : sans cela, le nombre tremble pendant l'animation. */
  font-variant-numeric: tabular-nums;
}

.ring__value {
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 400;
}

.ring--lg .ring__value {
  font-size: var(--font-size-2xl);
}

.ring__unit,
.ring__reference {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.ring__reference,
.ring__status,
.ring__legend {
  margin: 0;
}

.ring__legend {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* Légende du trait : le même trait en miniature. */
.ring__swatch {
  flex: none;
  width: 3px;
  height: 0.9em;
  border-radius: 1px;
  background: var(--color-text);
}

.ring__status {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.ring--exceeded .ring__status {
  color: var(--color-danger);
}

/* Le point d'exclamation double la couleur d'un signe (critère 1.4.1). */
.ring__alert {
  display: inline-grid;
  place-items: center;
  width: 1.2em;
  height: 1.2em;
  margin-right: 0.2em;
  border-radius: 50%;
  background: var(--color-danger);
  color: var(--color-bg);
  font-size: 0.85em;
  font-weight: 800;
}

/* Contraste forcé : nos couleurs disparaissent ; l'anneau prend des couleurs
   système distinctes pour rester lisible. */
@media (forced-colors: active) {
  .ring__track {
    stroke: GrayText;
  }

  .ring__fill,
  .ring__overflow {
    stroke: Highlight;
  }

  .ring__average,
  .ring__swatch {
    stroke: CanvasText;
    background: CanvasText;
    filter: none;
  }
}
</style>
