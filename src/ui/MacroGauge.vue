<script setup lang="ts">
/**
 * Jauge d'un nutriment ou des calories.
 *
 * Trois modes, parce que tous les repères ne se lisent pas pareil :
 *
 * - `target` — un besoin à **atteindre** (calories, macronutriments). La barre
 *   pleine est une réussite, le dépassement un signal.
 * - `floor` — un **minimum** (les fibres). Même barre, mais le dépasser n'est
 *   pas un excès : le texte dit « au minimum » et la moyenne ne parle jamais
 *   d'excès de fibres.
 * - `limit` — un plafond à **ne pas dépasser** (sucres, AG saturés, sel). La
 *   barre vide est la situation idéale ; annoncer « 4 sur 5 g » comme une
 *   progression féliciterait quelqu'un d'avoir approché sa limite de sel.
 *
 * Accessibilité : l'élément porte `role="progressbar"` avec ses trois valeurs
 * ARIA, **et** un `aria-valuetext` en toutes lettres. Sans ce dernier, un
 * lecteur d'écran annoncerait « 62 pour cent » — vrai mais inutilisable ; avec
 * lui, il annonce « Protéines : 93 sur 150 grammes ». En mode `limit`, le texte
 * dit « sur 5 grammes au maximum », ce qui change tout pour qui ne voit pas la
 * couleur (critère 1.4.1).
 *
 * **Moyenne des jours précédents.** Avec `average`, un trait marque sur la
 * barre l'apport moyen de la semaine écoulée, et une ligne de texte le chiffre
 * et nomme l'écart au repère — déficit, excès, ou rien à signaler. Le trait est
 * un repère visuel ; l'information elle-même est dans le texte, et dans
 * `aria-valuetext` (critère 1.4.1). La moyenne ne change pas l'objectif du
 * jour : elle se regarde, elle ne se rattrape pas.
 */
import { computed } from 'vue'

import { useAnimatedNumber } from './useAnimatedNumber'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    target: number
    unit?: string
    tone?: 'protein' | 'carbs' | 'fat' | 'fiber' | 'accent'
    mode?: 'target' | 'floor' | 'limit'
    /** Apport moyen par jour sur les jours précédents ; absent ou `null` : rien à montrer. */
    average?: number | null
    /** Nombre de jours renseignés sur lesquels porte la moyenne. */
    averageDays?: number
    /** Longueur de la période observée ; tant qu'elle est pleine, inutile de préciser « renseignés ». */
    periodDays?: number
  }>(),
  { unit: 'g', tone: 'accent', mode: 'target', average: null, averageDays: 7, periodDays: 7 },
)

/** Le remplissage est plafonné à 100 % ; le dépassement se lit sur la couleur. */
const ratio = computed(() =>
  props.target <= 0 ? 0 : Math.min(1, props.value / props.target),
)
const isExceeded = computed(() => props.target > 0 && props.value > props.target)

/** Sans séparateur de milliers, comme les chiffres de l'en-tête. */
const amountFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
  useGrouping: false,
})

/**
 * Une décimale pour les petites quantités en grammes — le sel se joue au
 * dixième —, aucune pour les calories ni au-delà de 10.
 */
function amount(value: number): string {
  const magnitude = Math.abs(value)
  const precise = props.unit !== 'kcal' && magnitude < 10
  return amountFormat.format(precise ? Math.round(magnitude * 10) / 10 : Math.round(magnitude))
}

/** En deçà d'un centième du repère, un écart n'est pas une information. */
const NEGLIGIBLE_SHARE = 0.01

/**
 * Écart de la moyenne au repère, en mots. Les mots dépendent du sens de
 * lecture : dépasser un minimum ou rester sous un plafond n'a rien d'un écart
 * à signaler.
 */
function describeGap(gap: number): string {
  const unit = `${amount(gap)} ${props.unit}`
  const negligible = amount(gap) === '0' || Math.abs(gap) < props.target * NEGLIGIBLE_SHARE
  if (props.mode === 'limit') {
    if (negligible) return 'au niveau du plafond'
    return gap > 0 ? `excès moyen de ${unit}` : 'sous le plafond'
  }
  if (props.mode === 'floor') {
    if (negligible || gap > 0) return 'minimum atteint'
    return `déficit moyen de ${unit}`
  }
  if (negligible) return 'au niveau du besoin'
  return gap > 0 ? `excès moyen de ${unit}` : `déficit moyen de ${unit}`
}

const averageNote = computed(() => {
  if (props.average === null || props.averageDays <= 0) return null
  const period =
    props.averageDays === 1
      ? 'un seul jour renseigné'
      : props.averageDays >= props.periodDays
        ? `${props.averageDays} jours`
        : `${props.averageDays} jours renseignés`
  const figure = `${amount(props.average)} ${props.unit}`
  const gap = describeGap(props.average - props.target)
  return {
    period,
    figure,
    gap,
    spoken: `Moyenne sur ${period} : ${figure} par jour, ${gap}`,
    // Au-delà du repère, le trait reste au bout de la barre : le texte donne le chiffre.
    position: props.target <= 0 ? 0 : Math.min(1, props.average / props.target),
  }
})

const animatedValue = useAnimatedNumber(() => props.value)
const animatedRatio = useAnimatedNumber(() => ratio.value)

const rounded = computed(() => Math.round(animatedValue.value))
const percent = computed(() => `${(animatedRatio.value * 100).toFixed(1)}%`)

const valueText = computed(() => {
  const head = `${props.label} : ${Math.round(props.value)} sur ${Math.round(props.target)} ${props.unit}`
  const bound = { target: '', floor: ' au minimum', limit: ' au maximum' }[props.mode]
  const reading = `${head}${bound}`
  return averageNote.value === null ? reading : `${reading}. ${averageNote.value.spoken}`
})
</script>

<template>
  <div
    class="gauge"
    :class="[`gauge--${tone}`, `gauge--${mode}`, { 'gauge--exceeded': isExceeded }]"
  >
    <div class="gauge__header">
      <span class="gauge__label">{{ label }}</span>
      <span class="gauge__figures">
        <strong>{{ rounded }}</strong>
        <span class="gauge__target">
          / {{ Math.round(target) }} {{ unit }}
          <template v-if="mode === 'limit'">max</template>
          <template v-else-if="mode === 'floor'">min</template>
        </span>
      </span>
    </div>

    <div class="gauge__bar">
      <div
        class="gauge__track"
        role="progressbar"
        :aria-valuenow="Math.round(value)"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(target)"
        :aria-valuetext="valueText"
      >
        <div
          class="gauge__fill"
          :style="{ width: percent }"
        />
      </div>
      <!-- Hors de la piste, qui rogne ce qui déborde : le trait dépasse de la
           barre pour rester lisible par-dessus le remplissage. -->
      <div
        v-if="averageNote"
        class="gauge__marker"
        :style="{ left: `${(averageNote.position * 100).toFixed(1)}%` }"
      />
    </div>

    <p
      v-if="averageNote"
      class="gauge__average"
    >
      <span
        class="gauge__swatch"
        aria-hidden="true"
      />
      <span>
        Moyenne sur {{ averageNote.period }} : <strong>{{ averageNote.figure }}</strong>
        · {{ averageNote.gap }}
      </span>
    </p>
  </div>
</template>

<style scoped lang="scss">
.gauge {
  --gauge-color: var(--color-accent);

  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.gauge--protein {
  --gauge-color: var(--color-protein);
}

.gauge--carbs {
  --gauge-color: var(--color-carbs);
}

.gauge--fat {
  --gauge-color: var(--color-fat);
}

.gauge--fiber {
  --gauge-color: var(--color-fiber);
}

/* Un plafond n'est pas une cible : la barre reste sourde tant qu'elle se
   remplit, pour ne pas donner l'allure d'une progression à encourager. Elle ne
   parle qu'en passant au rouge, une fois la limite franchie. */
.gauge--limit {
  --gauge-color: var(--color-text-muted);
}

/* Après `--limit`, et non avant : le dépassement doit l'emporter sur le ton
   sourd du plafond, quelle que soit l'ordre des classes dans le template. */
.gauge--exceeded {
  --gauge-color: var(--color-danger);
}

.gauge__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.gauge__label {
  font-weight: 600;
}

.gauge__figures {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);

  /* Chiffres à chasse fixe : sans cela, la largeur saute à chaque image pendant
     l'interpolation et le texte tremble. */
  font-variant-numeric: tabular-nums;
}

.gauge__target {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.gauge__bar {
  position: relative;
}

.gauge__track {
  position: relative;
  height: 10px;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
}

.gauge__fill {
  height: 100%;
  background: var(--gauge-color);
  border-radius: inherit;
}

/* Trait de la moyenne. Couleur du texte, liseré de fond : il garde un contraste
   d'au moins 3:1 (critère 1.4.11) contre la piste comme contre le remplissage,
   dans chacun des thèmes. */
.gauge__marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  margin-left: -1.5px;
  background: var(--color-text);
  border-radius: 1px;
  box-shadow: 0 0 0 1px var(--color-bg);
}

.gauge__average {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.gauge__average strong {
  color: var(--color-text);
}

/* Légende du trait : le même trait en miniature, qui relie la phrase au repère
   dessiné sur la barre. */
.gauge__swatch {
  flex: none;
  align-self: flex-start;
  width: 3px;
  height: 0.9em;
  margin-top: 0.2em;
  background: var(--color-text);
  border-radius: 1px;
}

/* Contraste forcé : nos couleurs disparaissent. Le remplissage et le trait
   prennent des couleurs système distinctes, pour que la jauge reste lisible. */
@media (forced-colors: active) {
  .gauge__fill {
    background: CanvasText;
    forced-color-adjust: none;
  }

  .gauge__marker,
  .gauge__swatch {
    background: Highlight;
    box-shadow: none;
    forced-color-adjust: none;
  }
}
</style>
