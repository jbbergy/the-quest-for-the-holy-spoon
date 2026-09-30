<script setup lang="ts">
/**
 * Bascule « repas mangé ».
 *
 * C'est un vrai `<button>` porteur de `aria-pressed`, et non deux boutons qui
 * se remplacent : l'état est annoncé par le bouton lui-même, le focus survit à
 * la bascule, et le libellé reste **stable** (« Mangé ») au lieu de changer sous
 * le lecteur d'écran. L'heure s'affiche à côté, hors du nom accessible, pour ne
 * pas le faire varier à chaque minute.
 */
import { computed } from 'vue'

import { dateFormat, t } from '@/i18n'

const props = defineProps<{
  /** Date ISO de consommation, ou `null` si le repas n'est que prévu. */
  consumedAt: string | null
  /** Libellé du repas, pour distinguer les boutons d'une liste au lecteur d'écran. */
  mealLabel: string
  busy?: boolean
}>()

const emit = defineEmits<{ toggle: [boolean] }>()

const isConsumed = computed(() => props.consumedAt !== null)

const time = computed(() => {
  if (props.consumedAt === null) return null
  const date = new Date(props.consumedAt)
  return Number.isNaN(date.getTime()) ? null : dateFormat({ hour: '2-digit', minute: '2-digit' }).format(date)
})
</script>

<template>
  <div class="consumed">
    <button
      type="button"
      class="consumed__toggle touch-target"
      :class="{ 'consumed__toggle--on': isConsumed }"
      :aria-pressed="isConsumed ? 'true' : 'false'"
      :aria-busy="busy ? 'true' : undefined"
      @click="emit('toggle', !isConsumed)"
    >
      <span
        class="consumed__mark"
        aria-hidden="true"
      >{{ isConsumed ? '✓' : '○' }}</span>
      <span>{{ t('ui.consumed.label') }}</span>
      <!-- Le libellé du repas n'est visible nulle part dans le bouton : sans lui,
           une liste de quatre repas offrirait quatre boutons « Mangé » identiques. -->
      <span class="sr-only"> — {{ mealLabel }}</span>
    </button>

    <p
      v-if="time"
      class="consumed__time"
    >
      {{ t('ui.consumed.at', { time }) }}
    </p>
    <p
      v-else
      class="consumed__time"
    >
      {{ t('ui.consumed.not') }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.consumed {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.consumed__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.consumed__toggle--on {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.consumed__mark {
  font-size: var(--font-size-lg);
  line-height: 1;
}

.consumed__time {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
