<script setup lang="ts">
/**
 * « Prévoir aussi pour… » : le même repas dans la semaine d'autres membres.
 *
 * Chaque membre coché reçoit sa copie, non prise, aux portions ajustées à ses
 * besoins. La copie lui appartient : il la modifie et la coche lui-même. Trois
 * contextes se croisent ici — le repas, le foyer, les besoins —, d'où la place
 * de ce composant dans `src/app/`.
 */
import { computed, ref } from 'vue'

import { useContainer } from '@/app/container'
import { useHousehold } from '@/app/useHousehold'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { MealId, PlayerId } from '@/core/identity'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const props = defineProps<{ mealId: MealId }>()

const household = useHousehold()
const players = usePlayerStore()

/** Les autres membres qui ont un profil : on ne prévoit rien pour un compte sans profil. */
const guests = computed(() =>
  (household.household?.members ?? []).flatMap((member) =>
    member.playerId === null || member.playerId === players.playerId
      ? []
      : [{ playerId: member.playerId, name: member.name ?? member.email, targetCalories: member.targetCalories }],
  ),
)

const chosen = ref<PlayerId[]>([])
const busy = ref(false)
const message = ref('')
const error = ref<ErrorView | null>(null)

const listFormat = new Intl.ListFormat('fr-FR', { style: 'long', type: 'conjunction' })

async function plan(): Promise<void> {
  const plannedBy = players.playerId
  const selected = guests.value.filter((guest) => chosen.value.includes(guest.playerId))
  if (plannedBy === null || selected.length === 0) return

  busy.value = true
  message.value = ''
  error.value = null
  const result = await useContainer().inventory.planForMembers.execute({
    mealId: props.mealId,
    plannedBy,
    ownCalories: players.needs?.targetCalories ?? null,
    guests: selected,
  })
  busy.value = false

  if (!result.ok) {
    error.value = toErrorView(result.error)
    return
  }
  chosen.value = []
  const names = listFormat.format(selected.map((guest) => guest.name))
  const unknown = selected.filter((guest) => guest.targetCalories === null)
  message.value =
    unknown.length === 0
      ? `Le repas est prévu pour ${names}. Les portions sont adaptées au besoin de chacun.`
      : `Le repas est prévu pour ${names}. Nous ne connaissons pas encore le besoin de ${listFormat.format(unknown.map((guest) => guest.name))} : ses portions sont les mêmes que les vôtres.`
}
</script>

<template>
  <BaseCard
    v-if="guests.length > 0"
    title="Prévoir aussi pour…"
    subtitle="Chaque personne reçoit ce repas dans sa semaine. Les portions sont adaptées à son besoin. Elle pourra les changer."
  >
    <ErrorNotice :error="error" />

    <fieldset class="plan__fieldset">
      <legend class="sr-only">
        Membres du foyer
      </legend>
      <label
        v-for="guest in guests"
        :key="guest.playerId"
        class="plan__choice"
      >
        <input
          v-model="chosen"
          type="checkbox"
          :value="guest.playerId"
        >
        <span>{{ guest.name }}</span>
      </label>
    </fieldset>

    <BaseButton
      variant="secondary"
      :disabled="chosen.length === 0"
      :loading="busy"
      @click="plan"
    >
      Prévoir pour {{ chosen.length > 1 ? 'ces personnes' : 'cette personne' }}
    </BaseButton>

    <p
      class="plan__message"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </p>
  </BaseCard>
</template>

<style scoped lang="scss">
.plan__fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-3);
  padding: 0;
  border: none;
}

.plan__choice {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  cursor: pointer;
}

.plan__choice input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--color-accent);
}

.plan__message {
  margin: var(--space-3) 0 0;
  min-height: 1.25rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
</style>
