<script setup lang="ts">
/**
 * La semaine : ce qui est prévu, ce qui a été mangé, jour par jour.
 *
 * Cet écran remplace le journal. Les jours passés y montrent ce qui a été mangé,
 * les jours à venir ce qui est prévu — une seule liste, un seul endroit où les
 * repas se composent, se corrigent et se suppriment.
 *
 * « Mangé » n'est proposé qu'aujourd'hui et avant : le domaine refuse de compter
 * un repas dans une journée qui n'a pas encore eu lieu, et un bouton qui
 * échouerait à coup sûr n'a pas sa place à l'écran.
 */
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

import { formatDay, formatWeek, mealLabel, mealOrder } from '@/app/mealLabels'
import { ROUTE } from '@/app/router'
import { useTodayStore } from '@/app/day/useTodayStore'
import { memberName, useHousehold } from '@/app/useHousehold'
import { useOpenDaysStore } from '@/app/useOpenDays'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import { useReturnQuery } from '@/app/useBackLink'
import { addDays, type DayKey, startOfWeek } from '@/core/day'
import type { MealId } from '@/core/identity'
import { t, upperFirst } from '@/i18n'
import { type MealSummary, MealType, type PlannedDay } from '@/modules/nutrition_inventory/application'
import { useWeekPlanStore } from '@/modules/nutrition_inventory/presentation/useWeekPlanStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'

const router = useRouter()
const players = usePlayerStore()
const week = useWeekPlanStore()
const household = useHousehold()
const openDays = useOpenDaysStore()
const returnQuery = useReturnQuery()

const clock = useTodayStore()
/** Journée en cours, selon l'heure de début choisie ; bascule sans rechargement. */
const today = computed(() => clock.today)
const isCurrentWeek = computed(() => week.weekStart === startOfWeek(today.value))

const range = computed(() => {
  const first = week.days[0]?.day
  const last = week.days[week.days.length - 1]?.day
  return first === undefined || last === undefined ? '' : formatWeek(first, last)
})

async function load(anyDay?: DayKey): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await week.load(playerId, anyDay ?? today.value)
}

onMounted(() => load())

// Ce qu'un autre appareil a prévu ou coché apparaît dans la semaine affichée.
const { remoteRevision } = useSyncStatus()
watch([remoteRevision, () => players.playerId], () => load(week.days[0]?.day))

function sorted(meals: readonly MealSummary[]): MealSummary[] {
  return [...meals].sort((a, b) => mealOrder(a.type) - mealOrder(b.type))
}

/**
 * Type proposé pour un nouveau repas : le premier des trois principaux qui
 * manque ce jour-là, sinon une collation. L'éditeur permet de le changer ; il
 * s'agit seulement d'éviter de proposer « Déjeuner » sur une journée qui en a
 * déjà un.
 */
function nextMealType(day: PlannedDay): MealType {
  const planned = new Set(day.meals.map((meal) => meal.type))
  return (
    [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER].find((type) => !planned.has(type)) ??
    MealType.SNACK
  )
}

async function addMeal(day: PlannedDay): Promise<void> {
  await router.push({
    name: ROUTE.mealEditor,
    query: { jour: day.day, type: nextMealType(day), ...returnQuery.value },
  })
}

async function openShoppingList(): Promise<void> {
  await router.push({
    name: ROUTE.shoppingList,
    query: { semaine: week.weekStart, ...returnQuery.value },
  })
}

async function setConsumed(mealId: MealId, consumed: boolean): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await week.setConsumed(playerId, mealId, consumed)
}

/**
 * « Lundi 22 septembre » : une capitale initiale fait lire le jour comme un
 * intitulé, pas comme une phrase coupée.
 */
function dayTitle(day: DayKey): string {
  return upperFirst(formatDay(day))
}

function subtitle(day: PlannedDay): string {
  const total =
    day.meals.length === 0
      ? t('week.noMeals')
      : t('week.total', { kcal: Math.round(day.plannedCalories) })
  return day.day === today.value ? t('week.todayWithTotal', { total }) : total
}
</script>

<template>
  <div class="week">
    <h1>{{ t('week.title') }}</h1>

    <nav
      class="week__nav"
      :aria-label="t('week.navLabel')"
    >
      <BaseButton
        variant="ghost"
        size="sm"
        @click="load(addDays(week.weekStart, -7))"
      >
        <span aria-hidden="true">←</span>
        <span class="sr-only">{{ t('week.previous') }}</span>
      </BaseButton>

      <p
        class="week__range"
        aria-live="polite"
      >
        {{ range }}
      </p>

      <BaseButton
        variant="ghost"
        size="sm"
        @click="load(addDays(week.weekStart, 7))"
      >
        <span aria-hidden="true">→</span>
        <span class="sr-only">{{ t('week.next') }}</span>
      </BaseButton>
    </nav>

    <div class="week__actions">
      <BaseButton
        variant="secondary"
        size="sm"
        @click="openShoppingList"
      >
        {{ t('week.shoppingList') }}
        <span class="sr-only">{{ t('week.shoppingListOfWeek') }}</span>
      </BaseButton>

      <BaseButton
        v-if="!isCurrentWeek"
        variant="secondary"
        size="sm"
        @click="load(today)"
      >
        {{ t('week.backToCurrent') }}
      </BaseButton>
    </div>

    <ErrorNotice :error="week.error" />

    <ol class="week__days">
      <li
        v-for="day in week.days"
        :key="day.day"
      >
        <BaseCard
          :title="dayTitle(day.day)"
          :subtitle="subtitle(day)"
          :class="{ 'week__day--today': day.day === today }"
          collapsible
          :open="openDays.isOpen(day.day)"
          @update:open="(next) => openDays.setOpen(day.day, next)"
        >
          <template #actions>
            <BaseButton
              variant="ghost"
              size="sm"
              @click="addMeal(day)"
            >
              <span aria-hidden="true">＋</span> {{ t('week.addMeal') }}
              <span class="sr-only">{{ t('week.addMealOn', { day: formatDay(day.day) }) }}</span>
            </BaseButton>
          </template>

          <ul
            v-if="day.meals.length > 0"
            class="week__meals"
          >
            <li
              v-for="meal in sorted(day.meals)"
              :key="meal.mealId"
              class="week__meal"
            >
              <RouterLink
                class="week__meal-link"
                :to="{ name: ROUTE.mealEditor, params: { mealId: meal.mealId }, query: returnQuery }"
              >
                <span class="week__meal-type">{{ mealLabel(meal.type) }}</span>
                <span class="week__meal-foods">
                  {{ meal.entries.map((entry) => entry.foodName).join(', ') }}
                </span>
                <span class="week__meal-kcal">{{ Math.round(meal.calories) }} kcal</span>
                <span
                  v-if="meal.plannedBy"
                  class="week__meal-by"
                >{{ t('week.plannedBy', { name: memberName(household.household, meal.plannedBy) ?? t('week.aHouseholdMember') }) }}</span>
                <span class="sr-only">{{ t('week.edit') }}</span>
              </RouterLink>

              <MealConsumedToggle
                v-if="day.day <= today"
                :consumed-at="meal.consumedAt"
                :meal-label="t('week.mealOnDay', { meal: mealLabel(meal.type), day: formatDay(day.day) })"
                @toggle="(next) => setConsumed(meal.mealId, next)"
              />
            </li>
          </ul>
        </BaseCard>
      </li>
    </ol>
  </div>
</template>

<style scoped lang="scss">
.week {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.week__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1);
  background: var(--color-surface);
  border-radius: var(--radius-pill);
}

.week__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.week__range {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.week__days {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Aujourd'hui se repère d'un coup d'œil ; le sous-titre « Aujourd'hui » porte la
   même information pour qui ne distingue pas la bordure. Sélecteur plus
   spécifique que le `.card` de BaseCard, pour ne pas dépendre de l'ordre des
   feuilles. */
.week__days .week__day--today {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.week__meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.week__meal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.week__meal-link {
  flex: 1 1 14rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 var(--space-3);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-decoration: none;

  &:hover {
    border-color: var(--color-accent);
  }
}

.week__meal-type {
  font-weight: 600;
}

.week__meal-kcal {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.week__meal-by {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-style: italic;
}

.week__meal-foods {
  grid-column: 1;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
