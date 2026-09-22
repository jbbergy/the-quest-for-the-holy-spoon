<script setup lang="ts">
/**
 * Jauge d'un nutriment ou des calories.
 *
 * Deux modes, parce que tous les repères ne se lisent pas pareil :
 *
 * - `target` — un apport à **atteindre** (calories, protéines, fibres…). La
 *   barre pleine est une réussite, le dépassement un signal.
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
    mode?: 'target' | 'limit'
  }>(),
  { unit: 'g', tone: 'accent', mode: 'target' },
)

/** Le remplissage est plafonné à 100 % ; le dépassement se lit sur la couleur. */
const ratio = computed(() =>
  props.target <= 0 ? 0 : Math.min(1, props.value / props.target),
)
const isExceeded = computed(() => props.target > 0 && props.value > props.target)

const animatedValue = useAnimatedNumber(() => props.value)
const animatedRatio = useAnimatedNumber(() => ratio.value)

const rounded = computed(() => Math.round(animatedValue.value))
const percent = computed(() => `${(animatedRatio.value * 100).toFixed(1)}%`)

const valueText = computed(() => {
  const head = `${props.label} : ${Math.round(props.value)} sur ${Math.round(props.target)} ${props.unit}`
  return props.mode === 'limit' ? `${head} au maximum` : head
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
        </span>
      </span>
    </div>

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
</style>
