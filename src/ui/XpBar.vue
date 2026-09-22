<script setup lang="ts">
/**
 * Barre d'expérience, avec célébration au franchissement de palier.
 *
 * L'animation de montée de niveau n'est pas déclenchée en comparant deux niveaux
 * dans un watcher : le domaine expose déjà un drapeau `levelledUp` calculé par
 * `PlayerProgress.award()`. Le comparer ici raterait le cas où le joueur rouvre
 * l'application après avoir gagné un niveau, et rejouerait l'animation à chaque
 * rechargement.
 */
import gsap from 'gsap'
import { onScopeDispose, ref, watch } from 'vue'

import { useAnimatedNumber } from './useAnimatedNumber'
import { useReducedMotion } from './useReducedMotion'

const props = withDefaults(
  defineProps<{
    level: number
    ratio: number
    xpIntoLevel: number
    xpToNextLevel: number | null
    levelledUp?: boolean
  }>(),
  { levelledUp: false },
)

const emit = defineEmits<{ celebrated: [] }>()

const badge = ref<HTMLElement | null>(null)
const reducedMotion = useReducedMotion()
const animatedRatio = useAnimatedNumber(() => props.ratio, { duration: 0.8 })

let celebration: gsap.core.Timeline | null = null

watch(
  () => props.levelledUp,
  (justLevelled) => {
    if (!justLevelled) return

    // Acquitter immédiatement, même sans animation : le drapeau ne doit pas
    // rester armé si le mouvement est réduit ou l'élément pas encore monté.
    if (reducedMotion.value || badge.value === null) {
      emit('celebrated')
      return
    }

    celebration?.kill()
    celebration = gsap
      .timeline({ onComplete: () => emit('celebrated') })
      .fromTo(
        badge.value,
        { scale: 1 },
        { scale: 1.35, duration: 0.25, ease: 'back.out(3)' },
      )
      .to(badge.value, { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' })
  },
)

onScopeDispose(() => celebration?.kill())
</script>

<template>
  <div class="xp">
    <div class="xp__header">
      <span
        ref="badge"
        class="xp__badge"
      >
        Niveau {{ level }}
      </span>
      <span class="xp__remaining">
        <template v-if="xpToNextLevel !== null">
          {{ xpToNextLevel }} XP avant le niveau {{ level + 1 }}
        </template>
        <template v-else>Niveau maximum atteint</template>
      </span>
    </div>

    <div
      class="xp__track"
      role="progressbar"
      :aria-valuenow="Math.round(ratio * 100)"
      :aria-valuemin="0"
      :aria-valuemax="100"
      :aria-valuetext="
        xpToNextLevel === null
          ? `Niveau ${level}, maximum atteint`
          : `Niveau ${level}, ${xpIntoLevel} XP acquis, ${xpToNextLevel} XP avant le niveau suivant`
      "
    >
      <div
        class="xp__fill"
        :style="{ width: `${(animatedRatio * 100).toFixed(1)}%` }"
      />
    </div>

    <!--
      Région discrète : la montée de niveau est annoncée aux lecteurs d'écran,
      qui ne « voient » évidemment pas l'animation du badge.
    -->
    <p
      class="sr-only"
      aria-live="polite"
    >
      <template v-if="levelledUp">
        Niveau {{ level }} atteint.
      </template>
    </p>
  </div>
</template>

<style scoped lang="scss">
.xp {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.xp__badge {
  display: inline-block;
  padding: var(--space-1) var(--space-3);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: 700;

  /* Le badge grossit au franchissement de palier : l'ancrage empêche le reste
     de la ligne de se décaler pendant l'animation. */
  transform-origin: left center;
}

.xp__remaining {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: right;
}

.xp__track {
  height: 8px;
  overflow: hidden;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
}

.xp__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent-soft), var(--color-accent));
  border-radius: inherit;
}
</style>
