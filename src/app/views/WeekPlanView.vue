<script setup lang="ts">
/**
 * La semaine : ce qui est prévu, ce qui a été mangé, jour par jour.
 *
 * Cet écran remplace le journal. Les jours passés y montrent ce qui a été mangé,
 * les jours à venir ce qui est prévu — une seule liste, un seul endroit où les
 * repas se composent, se corrigent et se suppriment.
 *
 * Une bande de sept jours, puis le jour choisi. Chaque jour de la bande dit
 * son état par une marque — point plein : des repas mangés ; point creux :
 * des repas prévus ; bord en tirets : rien — **et** par son nom accessible,
 * qui l'écrit en toutes lettres (« 2 repas mangés »). Le jour choisi est dans
 * l'adresse (`?jour=`) : on le retrouve en revenant d'un repas.
 *
 * « Mangé » n'est proposé qu'aujourd'hui et avant : le domaine refuse de compter
 * un repas dans une journée qui n'a pas encore eu lieu, et un bouton qui
 * échouerait à coup sûr n'a pas sa place à l'écran.
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { formatDay, formatWeek, mealLabel, mealOrder } from '@/app/mealLabels'
import { ROUTE } from '@/app/router'
import { useTodayStore } from '@/app/day/useTodayStore'
import { memberName, useHousehold } from '@/app/useHousehold'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import { useReturnQuery } from '@/app/useBackLink'
import { addDays, type DayKey, dateOfDay, parseDayKey, startOfWeek } from '@/core/day'
import type { MealId } from '@/core/identity'
import { dateFormat, numberFormat, t, upperFirst } from '@/i18n'
import { type MealSummary, MealType, type PlannedDay } from '@/modules/nutrition_inventory/application'
import { useWeekPlanStore } from '@/modules/nutrition_inventory/presentation/useWeekPlanStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import MealConsumedToggle from '@/ui/MealConsumedToggle.vue'
import MeterBar from '@/ui/MeterBar.vue'

const route = useRoute()
const router = useRouter()
const players = usePlayerStore()
const week = useWeekPlanStore()
const household = useHousehold()
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

/** Autre semaine : le jour choisi n'y est plus, on l'oublie. */
async function showWeek(anyDay: DayKey): Promise<void> {
  const query = { ...route.query }
  delete query.jour
  await router.replace({ query })
  await load(anyDay)
}

onMounted(() => load(parseDayKey(String(route.query.jour ?? '')) ?? undefined))

// Ce qu'un autre appareil a prévu ou coché apparaît dans la semaine affichée.
const { remoteRevision } = useSyncStatus()
watch([remoteRevision, () => players.playerId], () => load(week.days[0]?.day))

/** Le jour affiché : celui de l'adresse s'il est dans la semaine, sinon aujourd'hui, sinon le lundi. */
const selected = computed<PlannedDay | null>(() => {
  const asked = parseDayKey(String(route.query.jour ?? ''))
  return (
    week.days.find((day) => day.day === asked) ??
    week.days.find((day) => day.day === today.value) ??
    week.days[0] ??
    null
  )
})

async function select(day: DayKey): Promise<void> {
  await router.replace({ query: { ...route.query, jour: day } })
}

function sorted(meals: readonly MealSummary[]): MealSummary[] {
  return [...meals].sort((a, b) => mealOrder(a.type) - mealOrder(b.type))
}

const eaten = (day: PlannedDay) => day.meals.filter((meal) => meal.consumedAt !== null)
const kcalOf = (meals: readonly MealSummary[]) => meals.reduce((sum, meal) => sum + meal.calories, 0)
const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

/** L'état d'un jour de la bande : la marque dessinée, et ce qu'elle veut dire. */
function stateOf(day: PlannedDay): { readonly mark: 'eaten' | 'planned' | 'nothing'; readonly spoken: string } {
  const eatenCount = eaten(day).length
  const plannedCount = day.meals.length - eatenCount
  if (day.meals.length === 0) return { mark: 'nothing', spoken: t('week.days.nothing') }
  const parts = [
    eatenCount > 0 ? t('week.days.eaten', { n: eatenCount }) : null,
    plannedCount > 0 ? t('week.days.planned', { n: plannedCount }) : null,
  ].filter((part): part is string => part !== null)
  return { mark: eatenCount > 0 ? 'eaten' : 'planned', spoken: parts.join(', ') }
}

const initial = (day: DayKey) => dateFormat({ weekday: 'narrow' }).format(dateOfDay(day))
const dayNumber = (day: DayKey) => dateFormat({ day: 'numeric' }).format(dateOfDay(day))

/** Ce qu'un lecteur d'écran entend sur un jour de la bande. */
function spokenDay(day: PlannedDay): string {
  return [formatDay(day.day), day.day === today.value ? t('week.days.today') : null, stateOf(day).spoken]
    .filter((part): part is string => part !== null)
    .join(', ')
}

/** « Mercredi 30 » : l'intitulé de la carte du jour. */
const selectedTitle = computed(() =>
  selected.value === null
    ? ''
    : upperFirst(dateFormat({ weekday: 'long', day: 'numeric' }).format(dateOfDay(selected.value.day))),
)

/** Mangé et prévu du jour choisi : les deux parts de la barre, et la phrase qui les dit. */
const balance = computed(() => {
  const day = selected.value
  if (day === null) return null
  const eatenKcal = kcalOf(eaten(day))
  const plannedKcal = day.plannedCalories - eatenKcal
  const text =
    eatenKcal > 0 && plannedKcal > 0
      ? t('week.eatenAndPlanned', { eaten: kcal(eatenKcal), planned: kcal(plannedKcal) })
      : eatenKcal > 0
        ? t('week.eatenOnly', { eaten: kcal(eatenKcal) })
        : t('week.plannedOnly', { planned: kcal(plannedKcal) })
  return { eaten: eatenKcal, planned: plannedKcal, text }
})

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

function newMealFor(day: PlannedDay) {
  return {
    name: ROUTE.mealEditor,
    query: { jour: day.day, type: nextMealType(day), ...returnQuery.value },
  }
}

/** `fill` : la liste se remplit en s'ouvrant, là où son résultat s'affiche. */
async function openShoppingList(fill = false): Promise<void> {
  await router.push({
    name: ROUTE.shoppingList,
    query: { semaine: week.weekStart, ...(fill ? { remplir: '1' } : {}), ...returnQuery.value },
  })
}

async function setConsumed(mealId: MealId, consumed: boolean): Promise<void> {
  const playerId = players.playerId
  if (playerId !== null) await week.setConsumed(playerId, mealId, consumed)
}
</script>

<template>
  <div class="week">
    <h1>{{ t('week.title') }}</h1>

    <nav
      class="week__nav"
      :aria-label="t('week.navLabel')"
    >
      <button
        type="button"
        class="week__arrow"
        @click="showWeek(addDays(week.weekStart, -7))"
      >
        <AppIcon name="chevron-left" />
        <span class="sr-only">{{ t('week.previous') }}</span>
      </button>

      <div class="week__range">
        <p
          class="week__range-dates"
          aria-live="polite"
        >
          {{ range }}
        </p>
        <p
          v-if="isCurrentWeek"
          class="week__range-note"
        >
          {{ t('week.thisWeek') }}
        </p>
        <button
          v-else
          type="button"
          class="week__back"
          @click="showWeek(today)"
        >
          {{ t('week.backToCurrent') }}
        </button>
      </div>

      <button
        type="button"
        class="week__arrow"
        @click="showWeek(addDays(week.weekStart, 7))"
      >
        <AppIcon name="chevron-right" />
        <span class="sr-only">{{ t('week.next') }}</span>
      </button>
    </nav>

    <ErrorNotice :error="week.error" />

    <div
      class="week__strip"
      role="group"
      :aria-label="t('week.days.label')"
    >
      <button
        v-for="day in week.days"
        :key="day.day"
        type="button"
        class="week__day"
        :class="[`week__day--${stateOf(day).mark}`, { 'week__day--today': day.day === today }]"
        :aria-pressed="selected?.day === day.day ? 'true' : 'false'"
        @click="select(day.day)"
      >
        <span
          class="week__day-initial"
          aria-hidden="true"
        >{{ initial(day.day) }}</span>
        <span
          class="week__day-number"
          aria-hidden="true"
        >{{ dayNumber(day.day) }}</span>
        <span
          class="week__day-mark"
          aria-hidden="true"
        />
        <span class="sr-only">{{ spokenDay(day) }}</span>
      </button>
    </div>

    <p
      class="week__legend"
      aria-hidden="true"
    >
      <span><span class="week__legend-mark week__legend-mark--eaten" />{{ t('week.days.legendEaten') }}</span>
      <span><span class="week__legend-mark week__legend-mark--planned" />{{ t('week.days.legendPlanned') }}</span>
      <span><span class="week__legend-mark week__legend-mark--nothing" />{{ t('week.days.legendNothing') }}</span>
    </p>

    <section
      v-if="selected"
      class="week__card"
      aria-labelledby="jour-choisi"
    >
      <div class="week__card-head">
        <h2 id="jour-choisi">
          {{ selectedTitle }}
          <span
            v-if="selected.day === today"
            class="week__card-today"
          >{{ t('week.dayToday') }}</span>
        </h2>
        <p
          v-if="players.needs && selected.meals.length > 0"
          class="week__card-total"
        >
          <strong>{{ kcal(selected.plannedCalories) }}</strong>
          {{ t('week.ofTarget', { kcal: kcal(players.needs.targetCalories) }) }}
        </p>
      </div>

      <template v-if="balance && selected.meals.length > 0">
        <MeterBar
          v-if="players.needs"
          class="week__card-bar"
          :value="balance.eaten"
          :planned="balance.planned"
          :target="players.needs.targetCalories"
        />
        <p class="week__card-balance">
          {{ balance.text }}
        </p>
      </template>

      <p
        v-else
        class="week__card-balance"
      >
        {{ t('week.noMeals') }}
      </p>

      <ul
        v-if="selected.meals.length > 0"
        class="week__meals"
      >
        <li
          v-for="meal in sorted(selected.meals)"
          :key="meal.mealId"
          class="week__meal"
        >
          <RouterLink
            class="week__meal-link"
            :to="{ name: ROUTE.mealEditor, params: { mealId: meal.mealId }, query: returnQuery }"
          >
            <span class="week__meal-type">
              {{ mealLabel(meal.type) }} · {{ kcal(meal.calories) }} kcal<template v-if="meal.consumedAt === null"> · {{ t('week.planned') }}</template>
            </span>
            <span class="week__meal-foods">
              {{ meal.entries.map((entry) => entry.foodName).join(', ') }}
            </span>
            <span
              v-if="meal.plannedBy"
              class="week__meal-by"
            >{{ t('week.plannedBy', { name: memberName(household.household, meal.plannedBy) ?? t('week.aHouseholdMember') }) }}</span>
            <span class="sr-only">{{ t('week.edit') }}</span>
          </RouterLink>

          <MealConsumedToggle
            v-if="selected.day <= today"
            :consumed-at="meal.consumedAt"
            :meal-label="t('week.mealOnDay', { meal: mealLabel(meal.type), day: formatDay(selected.day) })"
            :show-time="false"
            @toggle="(next) => setConsumed(meal.mealId, next)"
          />
        </li>
      </ul>

      <RouterLink
        class="week__add"
        :to="newMealFor(selected)"
      >
        <AppIcon name="plus" />
        {{ t('week.addMeal') }}
        <span class="sr-only">{{ t('week.addMealOn', { day: formatDay(selected.day) }) }}</span>
      </RouterLink>
    </section>

    <section
      class="week__shopping"
      aria-labelledby="liste-de-courses"
    >
      <div class="week__shopping-head">
        <span
          class="week__shopping-icon"
          aria-hidden="true"
        >
          <AppIcon name="basket" />
        </span>
        <div>
          <h2 id="liste-de-courses">
            {{ t('week.shopping.title') }}
          </h2>
          <p class="week__shopping-note">
            {{ t('week.shopping.forWeek', { range }) }}
            <template v-if="household.household">
              {{ t('week.shopping.shared') }}
            </template>
          </p>
        </div>
      </div>
      <div class="week__shopping-actions">
        <BaseButton
          class="week__shopping-open"
          @click="openShoppingList()"
        >
          {{ t('week.shopping.open') }}
        </BaseButton>
        <BaseButton
          class="week__shopping-fill"
          variant="secondary"
          @click="openShoppingList(true)"
        >
          {{ t('week.shopping.fill') }}
          <span class="sr-only">{{ t('week.shopping.fillHint') }}</span>
        </BaseButton>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.week {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  h1,
  h2 {
    margin: 0;
  }
}

/* Semaine précédente, dates, semaine suivante. */
.week__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.week__arrow {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-surface-raised);
  color: var(--color-text);
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
  }
}

.week__range {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.week__range-dates {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.week__range-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.week__back {
  min-height: 44px;
  padding: 0 var(--space-2);
  border: none;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

/* La bande des sept jours. */
.week__strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.week__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 4.5rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;

  &:hover {
    border-color: var(--color-border-strong);
  }
}

/* Rien de prévu : un bord en tirets, et pas de fond — le jour est « à remplir ». */
.week__day--nothing {
  border: 1px dashed var(--color-border-strong);
  background: transparent;
}

/* Aujourd'hui : un trait sous le numéro, en plus du mot dans le nom accessible. */
.week__day--today .week__day-number {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.week__day-initial {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.week__day-number {
  font-size: 1.125rem;
  font-weight: 700;
}

.week__day-mark {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.week__day--eaten .week__day-mark {
  background: var(--color-accent);
}

.week__day--planned .week__day-mark {
  border: 1.5px solid var(--color-accent);
}

/* Le jour choisi : plein Encre, texte clair — forme et contraste, pas la seule teinte. */
.week__day[aria-pressed='true'] {
  border: 1px solid var(--color-inverse);
  background: var(--color-inverse);
  color: var(--color-on-inverse);

  .week__day-initial {
    color: var(--color-on-inverse);
  }

  .week__day-mark {
    border-color: var(--color-on-inverse);
  }
}

.week__day--eaten[aria-pressed='true'] .week__day-mark {
  background: var(--color-on-inverse);
}

.week__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);

  > span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
}

.week__legend-mark {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.week__legend-mark--eaten {
  background: var(--color-accent);
}

.week__legend-mark--planned {
  border: 1.5px solid var(--color-accent);
}

.week__legend-mark--nothing {
  width: 12px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 3px;
}

/* La carte du jour choisi. */
.week__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.week__card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-3);
}

.week__card-today {
  color: var(--color-text-muted);
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  letter-spacing: normal;
}

.week__card-total {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;

  strong {
    color: var(--color-text);
  }
}

.week__card-bar {
  height: 8px;
}

.week__card-balance {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.week__meals {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.week__meal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-divider);
}

.week__meal-link {
  display: flex;
  flex: 1 1 12rem;
  min-width: 0;
  flex-direction: column;
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;

  &:hover {
    color: var(--color-text);

    .week__meal-foods {
      text-decoration: underline;
    }
  }
}

.week__meal-type {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.week__meal-foods {
  overflow-wrap: break-word;
}

.week__meal-by {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-style: italic;
}

.week__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 3.25rem;
  border: 2px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-accent);
  text-decoration: none;

  &:hover {
    background: var(--color-accent-soft);
    color: var(--color-accent-strong);
  }
}

/* La liste de courses : un encart foncé, l'icône sur fond safran. */
.week__shopping {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--card-padding);
  background: var(--color-inverse);
  border-radius: var(--radius-xl);
  color: var(--color-on-inverse);

  h2 {
    font-size: var(--font-size-lg);
  }
}

.week__shopping-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.week__shopping-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--color-saffron);
  color: var(--color-on-saffron);
}

.week__shopping-note {
  margin: 0;
  color: var(--color-on-inverse-muted);
  font-size: var(--font-size-sm);
}

.week__shopping-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);

  /* Côte à côte s'ils tiennent sur une ligne chacun, sinon l'un sous l'autre. */
  > * {
    flex: 1 1 11rem;
    white-space: nowrap;
  }
}

/* Sur l'encart foncé, les boutons s'inversent : clair plein, puis clair au trait. */
.week__shopping .week__shopping-open {
  background: var(--color-on-inverse);
  color: var(--color-inverse);
}

.week__shopping .week__shopping-open:hover:not([aria-disabled='true']) {
  background: var(--color-on-inverse-muted);
}

.week__shopping .week__shopping-fill {
  border-color: var(--color-on-inverse);
  color: var(--color-on-inverse);

  &:hover {
    background: transparent;
    text-decoration: underline;
  }
}

/* Sur l'encart foncé, l'anneau de focus prend la couleur claire. */
.week__shopping :focus-visible {
  outline-color: var(--color-on-inverse);
}
</style>
