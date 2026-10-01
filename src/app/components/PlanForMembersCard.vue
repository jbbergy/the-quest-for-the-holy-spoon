<script setup lang="ts">
/**
 * « Prévoir aussi pour… » : le même repas dans la semaine d'autres membres.
 *
 * Chaque membre coché reçoit sa copie, non prise, aux portions ajustées à ses
 * besoins. La copie lui appartient : il la modifie et la coche lui-même. Trois
 * contextes se croisent ici — le repas, le foyer, les besoins —, d'où la place
 * de ce composant dans `src/app/`.
 *
 * Pour un membre coché, « Remplacer un aliment » ouvre un écran à part, avec
 * la recherche d'aliments : le couscous de tout le foyer, avec des merguez
 * végétales pour la personne végétarienne. Les choix attendent l'envoi dans
 * `usePlanForMembersStore`, qui survit à ce détour.
 */
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useContainer } from '@/app/container'
import { usePlanForMembersStore } from '@/app/plan/usePlanForMembersStore'
import { formatPortion } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { MealEntryId, MealId, PlayerId } from '@/core/identity'
import { formatList, t } from '@/i18n'
import type { MealEntrySummary } from '@/modules/nutrition_inventory/application'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const props = defineProps<{
  mealId: MealId
  /** Les lignes du repas enregistré : un remplacement ne vaut que pour une ligne qui existe. */
  entries: readonly MealEntrySummary[]
}>()

const route = useRoute()
const household = useHousehold()
const players = usePlayerStore()
const draft = usePlanForMembersStore()

watch(() => props.mealId, draft.forMeal, { immediate: true })

/** Les autres membres qui ont un profil : on ne prévoit rien pour un compte sans profil. */
const guests = computed(() =>
  (household.household?.members ?? []).flatMap((member) =>
    member.playerId === null || member.playerId === players.playerId
      ? []
      : [{ playerId: member.playerId, name: member.name ?? member.email, targetCalories: member.targetCalories }],
  ),
)

const chosen = computed({
  get: () => draft.chosen,
  set: (next: PlayerId[]) => (draft.chosen = next),
})

/** Les remplacements d'un membre qui portent encore sur une ligne du repas. */
function replacementsOf(playerId: PlayerId) {
  return draft.replacementsOf(playerId).filter((replacement) =>
    props.entries.some((entry) => entry.entryId === replacement.entryId),
  )
}

function replaceLink(playerId: PlayerId) {
  return {
    name: ROUTE.mealReplace,
    params: { mealId: props.mealId, playerId },
    query: { retour: route.fullPath },
  }
}

function cancel(playerId: PlayerId, entryId: MealEntryId): void {
  draft.cancel(playerId, entryId)
}

const busy = ref(false)
const message = ref('')
const error = ref<ErrorView | null>(null)

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
    guests: selected.map((guest) => ({
      ...guest,
      replacements: replacementsOf(guest.playerId).map((replacement) => ({
        entryId: replacement.entryId,
        foodItemId: replacement.foodItemId,
        grams: replacement.grams,
        measure: replacement.measure.label,
      })),
    })),
  })
  busy.value = false

  if (!result.ok) {
    error.value = toErrorView(result.error)
    return
  }
  draft.clear()
  const names = formatList(selected.map((guest) => guest.name))
  const unknown = selected.filter((guest) => guest.targetCalories === null)
  message.value =
    unknown.length === 0
      ? t('week.plan.planned', { names })
      : t('week.plan.plannedUnknown', { names, unknown: formatList(unknown.map((guest) => guest.name)) })
}
</script>

<template>
  <BaseCard
    v-if="guests.length > 0"
    :title="t('week.plan.title')"
    :subtitle="t('week.plan.subtitle')"
  >
    <ErrorNotice :error="error" />

    <fieldset class="plan__fieldset">
      <legend class="sr-only">
        {{ t('week.plan.legend') }}
      </legend>
      <div
        v-for="guest in guests"
        :key="guest.playerId"
        class="plan__member"
      >
        <label class="plan__choice">
          <input
            v-model="chosen"
            type="checkbox"
            :value="guest.playerId"
          >
          <span>{{ guest.name }}</span>
        </label>

        <!-- Sous la case, ce qui change pour ce membre seul. -->
        <div
          v-if="chosen.includes(guest.playerId)"
          class="plan__changes"
        >
          <ul
            v-if="replacementsOf(guest.playerId).length > 0"
            class="plan__replacements"
            :aria-label="t('week.plan.changesFor', { name: guest.name })"
          >
            <li
              v-for="replacement in replacementsOf(guest.playerId)"
              :key="replacement.entryId"
              class="plan__replacement"
            >
              <span>{{
                t('week.plan.replacedBy', {
                  food: replacement.foodName,
                  replaced: replacement.replacedName,
                  portion: formatPortion(replacement.grams / replacement.measure.grams, replacement.measure),
                })
              }}</span>
              <BaseButton
                variant="ghost"
                size="sm"
                @click="cancel(guest.playerId, replacement.entryId)"
              >
                <span aria-hidden="true">{{ t('week.plan.cancel') }}</span>
                <span class="sr-only">{{ t('week.plan.cancelSpoken', { replaced: replacement.replacedName, name: guest.name }) }}</span>
              </BaseButton>
            </li>
          </ul>
          <RouterLink
            class="plan__replace"
            :to="replaceLink(guest.playerId)"
          >
            <AppIcon name="swap" />
            <!-- Sous la case du membre, son nom se lit déjà : le lecteur
                 d'écran, qui ne voit pas cette disposition, l'entend. -->
            <span>{{ t('week.plan.replaceShort') }}<span class="sr-only">{{ t('week.plan.replaceFor', { name: guest.name }) }}</span></span>
          </RouterLink>
        </div>
      </div>
    </fieldset>

    <BaseButton
      variant="secondary"
      :disabled="chosen.length === 0"
      :loading="busy"
      @click="plan"
    >
      {{ t('week.plan.submit', { n: chosen.length }) }}
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
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 0;
  border: none;
  min-width: 0;
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
  flex-shrink: 0;
  accent-color: var(--color-accent);
}

/* Décalé sous le nom : ces changements ne valent que pour ce membre. */
.plan__changes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-left: calc(1.15rem + var(--space-3));
}

.plan__replacements {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Le texte passe à la ligne ; « Annuler » reste au bord droit. */
.plan__replacement {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0 var(--space-2);
  font-size: var(--font-size-sm);

  > span {
    flex: 1 1 10rem;
    min-width: 0;
    overflow-wrap: break-word;
  }
}

.plan__replace {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-decoration: none;

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
}

.plan__message {
  margin: var(--space-3) 0 0;
  min-height: 1.25rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
</style>
