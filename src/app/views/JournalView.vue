<script setup lang="ts">
/**
 * Journal d'une journée, avec navigation entre les jours.
 *
 * C'est le seul écran où l'on corrige un repas, et seulement **tant qu'il n'a
 * pas été pris** : une fois déclaré mangé, ses apports sont entrés dans les
 * jauges et l'assistant a fondé sa recommandation dessus. Le domaine refuse
 * alors toute modification, et l'écran le dit au lieu de laisser l'usager buter
 * sur une erreur.
 *
 * Les corrections passent par les Use Cases, qui relisent l'agrégat : cet écran
 * lit des read models et ne manipule jamais d'entité.
 */
import { computed, onMounted, ref } from 'vue'

import { ROUTE } from '@/app/router'
import { dayKeyOf } from '@/core/day'
import type { MealEntryId, MealId } from '@/core/identity'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

const players = usePlayerStore()
const journal = useJournalStore()

const day = ref(new Date())

const MEAL_LABEL: Readonly<Record<string, string>> = {
  BREAKFAST: 'Petit-déjeuner',
  LUNCH: 'Déjeuner',
  DINNER: 'Dîner',
  SNACK: 'Collation',
}

const formatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const dayLabel = computed(() => formatter.format(day.value))

/** Repas composés mais pas encore pris : ils n'entrent pas dans le total. */
const plannedCount = computed(
  () => journal.meals.length - journal.consumedMeals.length,
)
const isToday = computed(() => dayKeyOf(day.value) === dayKeyOf(new Date()))

async function load(): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.load(playerId, day.value)
}

async function shiftDay(offset: number): Promise<void> {
  const next = new Date(day.value)
  next.setDate(next.getDate() + offset)
  day.value = next
  await load()
}

async function remove(mealId: MealId): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.deleteMeal(playerId, mealId)
}

async function setConsumed(mealId: MealId, consumed: boolean): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.setConsumed(playerId, mealId, consumed)
}

async function removeEntry(mealId: MealId, entryId: MealEntryId): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await journal.removeEntry(playerId, mealId, entryId)
}

/**
 * Corrige une portion.
 *
 * Déclenché sur `change` et non sur `input` : à chaque frappe, « 150 » passerait
 * par « 1 » puis « 15 », soit deux écritures inutiles en base et deux relectures
 * du journal. Une valeur vide ou nulle est ignorée plutôt que refusée — l'usager
 * est en train de retaper son nombre, pas de saisir une erreur.
 */
async function changeGrams(
  mealId: MealId,
  entryId: MealEntryId,
  raw: string | number,
): Promise<void> {
  const playerId = players.playerId
  const grams = typeof raw === 'number' ? raw : Number.parseFloat(raw)
  if (playerId === null || !Number.isFinite(grams) || grams <= 0) return

  await journal.changeQuantity(playerId, mealId, entryId, grams)
}

onMounted(load)
</script>

<template>
  <div class="journal">
    <h1>Journal</h1>

    <nav
      class="journal__days"
      aria-label="Navigation par jour"
    >
      <BaseButton
        variant="ghost"
        size="sm"
        @click="shiftDay(-1)"
      >
        <span aria-hidden="true">←</span>
        <span class="sr-only">Jour précédent</span>
      </BaseButton>

      <p
        class="journal__day"
        aria-live="polite"
      >
        {{ dayLabel }}
      </p>

      <BaseButton
        variant="ghost"
        size="sm"
        :disabled="isToday"
        @click="shiftDay(1)"
      >
        <span aria-hidden="true">→</span>
        <span class="sr-only">Jour suivant</span>
      </BaseButton>
    </nav>

    <ErrorNotice :error="journal.error" />

    <p
      v-if="!journal.isEmpty"
      class="journal__total"
    >
      <strong>{{ Math.round(journal.totalCalories) }} kcal</strong> pris sur la journée
      <template v-if="plannedCount > 0">
        — {{ plannedCount }} repas composé{{ plannedCount > 1 ? 's' : '' }} pas encore compté{{
          plannedCount > 1 ? 's' : '' }}
      </template>
    </p>

    <EmptyState
      v-if="journal.isEmpty"
      title="Journée vide"
      :description="isToday
        ? 'Rien n’a encore été enregistré aujourd’hui.'
        : 'Aucun repas enregistré ce jour-là.'"
    >
      <BaseButton
        v-if="isToday"
        @click="$router.push({ name: ROUTE.mealBuilder })"
      >
        Composer un repas
      </BaseButton>
    </EmptyState>

    <ul
      v-else
      class="journal__meals"
    >
      <li
        v-for="meal in journal.meals"
        :key="meal.mealId"
      >
        <BaseCard
          :title="MEAL_LABEL[meal.type] ?? meal.type"
          :class="{ 'journal__meal--planned': meal.consumedAt === null }"
        >
          <ul class="journal__entries">
            <li
              v-for="entry in meal.entries"
              :key="entry.entryId"
              class="journal__entry"
            >
              <span class="journal__entry-name">{{ entry.foodName }}</span>

              <template v-if="meal.consumedAt === null">
                <label class="journal__grams">
                  <span class="sr-only">Portion de {{ entry.foodName }}</span>
                  <input
                    type="number"
                    inputmode="decimal"
                    min="1"
                    step="1"
                    :value="entry.grams"
                    @change="
                      (event) =>
                        changeGrams(
                          meal.mealId,
                          entry.entryId,
                          (event.target as HTMLInputElement).value,
                        )
                    "
                  >
                  <span aria-hidden="true">g</span>
                </label>

                <BaseButton
                  variant="ghost"
                  size="sm"
                  @click="removeEntry(meal.mealId, entry.entryId)"
                >
                  <span aria-hidden="true">×</span>
                  <span class="sr-only">Retirer {{ entry.foodName }}</span>
                </BaseButton>
              </template>

              <span
                v-else
                class="journal__entry-grams"
              >{{ Math.round(entry.grams) }} g</span>
            </li>
          </ul>

          <p
            v-if="meal.consumedAt !== null"
            class="journal__locked"
          >
            Repas pris : décochez « Pris » pour le corriger.
          </p>

          <dl class="journal__macros">
            <div>
              <dt>Calories</dt>
              <dd>{{ Math.round(meal.calories) }} kcal</dd>
            </div>
            <div>
              <dt>Protéines</dt>
              <dd>{{ meal.macros.proteinG.toFixed(1) }} g</dd>
            </div>
            <div>
              <dt>Glucides</dt>
              <dd>{{ meal.macros.carbsG.toFixed(1) }} g</dd>
            </div>
            <div>
              <dt>Lipides</dt>
              <dd>{{ meal.macros.fatG.toFixed(1) }} g</dd>
            </div>
          </dl>

          <div class="journal__actions">
            <MealConsumedToggle
              :consumed-at="meal.consumedAt"
              :meal-label="MEAL_LABEL[meal.type] ?? meal.type"
              @toggle="(next) => setConsumed(meal.mealId, next)"
            />

            <BaseButton
              variant="danger"
              size="sm"
              @click="remove(meal.mealId)"
            >
              Supprimer ce repas
            </BaseButton>
          </div>
        </BaseCard>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.journal {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.journal__days {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1);
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}

.journal__day {
  margin: 0;
  font-weight: 600;

  /* La date change de longueur d'un jour à l'autre : la première lettre en
     capitale et une casse stable évitent que les flèches sautent. */
  text-transform: capitalize;
}

.journal__total {
  margin: 0;
  color: var(--color-text-muted);
}

.journal__meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.journal__entries {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}

.journal__entry {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
}

.journal__entry-name {
  flex: 1;
  min-width: 0;
}

.journal__entry-grams {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.journal__grams {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.journal__grams input {
  /* Assez large pour « 1000 » sans que la ligne ne se casse sur un petit écran. */
  width: 4.5rem;
  min-height: 44px;
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.journal__locked {
  margin: 0 0 var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* Un repas prévu reste lisible mais visiblement en retrait, sans reposer sur la
   seule couleur — le libellé « Pas encore compté » porte la même information.
   Sélecteur volontairement plus spécifique que le `.card` de BaseCard : à
   spécificité égale, seul l'ordre des feuilles trancherait. */
.journal__meals .journal__meal--planned {
  border: 1px dashed var(--color-border);
  background: transparent;
}

.journal__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.journal__macros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.journal__macros div {
  display: flex;
  flex-direction: column;
}

.journal__macros dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.journal__macros dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
