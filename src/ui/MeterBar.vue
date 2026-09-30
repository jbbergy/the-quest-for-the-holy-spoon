<script setup lang="ts">
/**
 * Barre de remplissage fine : protéines, sel, calories d'un jour.
 *
 * Elle est **décorative** (`aria-hidden`) : la valeur et le repère sont
 * toujours écrits à côté, en chiffres et en mots. Une barre sans texte ne
 * dirait rien à un lecteur d'écran, et une barre annoncée en plus du texte
 * le répéterait.
 *
 * `tone` : `accent` pour un besoin, `muted` pour une limite encore loin,
 * `danger` pour une limite presque atteinte ou dépassée. `planned` ajoute,
 * hachurée après le plein, la part encore prévue.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    target: number
    tone?: 'accent' | 'muted' | 'danger'
    planned?: number
  }>(),
  { tone: 'accent', planned: 0 },
)

const share = (amount: number): number =>
  props.target <= 0 ? 0 : Math.min(100, Math.max(0, (amount / props.target) * 100))

const filled = computed(() => share(props.value))
const plannedShare = computed(() => Math.min(100 - filled.value, share(props.planned)))
</script>

<template>
  <span
    class="meter"
    :class="`meter--${tone}`"
    aria-hidden="true"
  >
    <span
      class="meter__fill"
      :style="{ width: `${filled}%` }"
    />
    <span
      v-if="plannedShare > 0"
      class="meter__planned"
      :style="{ width: `${plannedShare}%` }"
    />
  </span>
</template>

<style scoped lang="scss">
.meter {
  display: flex;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--color-track);
}

.meter__fill {
  border-radius: 3px;
  background: var(--color-accent);
  transition: width var(--duration-slow) var(--ease-out);
}

.meter--muted .meter__fill {
  background: var(--color-text-muted);
}

.meter--danger .meter__fill {
  background: var(--color-danger);
}

/* Le prévu : hachures de la couleur de l'action, pour qu'il se distingue du
   mangé par le motif et pas seulement par la teinte. */
.meter__planned {
  background: repeating-linear-gradient(
    -45deg,
    var(--color-marker) 0 4px,
    transparent 4px 7px
  );
}

@media (forced-colors: active) {
  .meter {
    border: 1px solid CanvasText;
  }

  .meter__fill {
    forced-color-adjust: none;
    background: CanvasText;
  }
}
</style>
