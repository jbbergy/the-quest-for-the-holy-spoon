<script setup lang="ts">
/**
 * La journée d'un membre du foyer, en lecture seule.
 *
 * Mêmes jauges et même bilan que son propre accueil (`DayOverview`), calculés
 * par les mêmes use cases — mais ni case « Mangé », ni bouton d'édition : les
 * repas d'un autre ne se modifient pas d'ici. Rien n'est stocké sur l'appareil ;
 * l'écran se consulte en ligne.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import DayOverview from '@/app/components/DayOverview.vue'
import { useContainer } from '@/app/container'
import type { MemberDay } from '@/app/household/memberDays'
import { formatDay, mealLabel, mealOrder } from '@/app/mealLabels'
import { usePageTitle } from '@/app/pageTitle'
import { ROUTE } from '@/app/router'
import { memberName, useHousehold } from '@/app/useHousehold'
import { addDays, type DayKey, parseDayKey } from '@/core/day'
import { useTodayStore } from '@/app/day/useTodayStore'
import { type ErrorView, toErrorView } from '@/core/errors'
import { idFrom } from '@/core/identity'
import { lower, t } from '@/i18n'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

import { nameParams } from './householdFormat'

const route = useRoute()
const router = useRouter()
const household = useHousehold()

const clock = useTodayStore()
const today = computed(() => clock.today)
const playerId = computed(() => idFrom<'PlayerId'>(String(route.params.playerId)))
/** Jour consulté, `?jour=` ; aujourd'hui par défaut, jamais au-delà. */
const day = computed<DayKey>(() => {
  const asked = parseDayKey(String(route.query.jour ?? ''))
  return asked === null || asked > today.value ? today.value : asked
})

const member = shallowRef<MemberDay | null>(null)
const error = ref<ErrorView | null>(null)
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  const result = await useContainer().memberDays.read(playerId.value, day.value)
  loading.value = false
  if (result.ok) member.value = result.value
  else {
    member.value = null
    error.value = toErrorView(result.error)
  }
}

watch([playerId, day], load, { immediate: true })

/** Nom affiché : celui qu'il a publié, sinon ce que le foyer sait de lui. */
const name = computed(
  () => member.value?.name ?? memberName(household.household, playerId.value) ?? t('week.member.fallbackName'),
)

usePageTitle(() => t('week.member.pageTitle', nameParams(name.value)))

const meals = computed(() =>
  [...(member.value?.journal.meals ?? [])].sort((a, b) => mealOrder(a.type) - mealOrder(b.type)),
)
const planned = computed(() => meals.value.filter((meal) => meal.consumedAt === null))
const plannedCount = computed(() => planned.value.length)
const plannedCalories = computed(() => planned.value.reduce((sum, meal) => sum + meal.calories, 0))
const plannedNames = computed(() => planned.value.map((meal) => lower(mealLabel(meal.type))))

const goTo = (next: DayKey) =>
  router.replace({ name: ROUTE.memberDay, params: route.params, query: { jour: next } })
</script>

<template>
  <div class="member">
    <p class="member__back">
      <RouterLink :to="{ name: ROUTE.household }">
        {{ t('week.member.back') }}
      </RouterLink>
    </p>

    <header>
      <p class="member__eyebrow">
        {{ day === today ? t('week.member.today') : formatDay(day) }}
      </p>
      <h1>{{ name }}</h1>
    </header>

    <nav
      class="member__days"
      :aria-label="t('week.member.changeDay')"
    >
      <BaseButton
        variant="secondary"
        size="sm"
        @click="goTo(addDays(day, -1))"
      >
        <span aria-hidden="true">←</span> {{ t('week.member.previousDay') }}
      </BaseButton>
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="day >= today"
        @click="goTo(addDays(day, 1))"
      >
        {{ t('week.member.nextDay') }} <span aria-hidden="true">→</span>
      </BaseButton>
    </nav>

    <p
      v-if="error?.code === 'DAYS_NOT_SHARED'"
      class="member__notice"
      role="status"
    >
      {{ t('week.member.notShared', { name }) }}
    </p>
    <ErrorNotice
      v-else
      :error="error"
    />

    <p
      v-if="loading && member === null"
      class="member__text"
    >
      {{ t('week.member.loading') }}
    </p>

    <template v-if="member">
      <DayOverview
        v-if="member.needs"
        :day="day"
        :needs="member.needs"
        :total-calories="member.journal.totalCalories"
        :total-macros="member.journal.totalMacros"
        :total-detail="member.journal.totalDetail"
        :recent="member.recent"
        :planned-count="plannedCount"
        :planned-calories="plannedCalories"
        :planned-meals="plannedNames"
        :consumed-count="member.journal.consumedMeals.length"
      />
      <p
        v-else
        class="member__text"
      >
        {{ t('week.member.gaugesNotReady', nameParams(name)) }}
      </p>

      <BaseCard :title="t('week.member.mealsTitle', nameParams(name))">
        <EmptyState
          v-if="meals.length === 0"
          :title="t('week.member.noMealsTitle')"
          :description="t('week.member.noMealsDescription')"
        />
        <ul
          v-else
          class="member__meals"
        >
          <li
            v-for="meal in meals"
            :key="meal.mealId"
            class="member__meal"
            :class="{ 'member__meal--planned': meal.consumedAt === null }"
          >
            <span class="member__meal-type">{{ mealLabel(meal.type) }}</span>
            <span class="member__meal-kcal">{{ Math.round(meal.calories) }} kcal</span>
            <span class="member__meal-foods">{{ meal.entries.map((entry) => entry.foodName).join(', ') }}</span>
            <span class="member__meal-state">{{ meal.consumedAt === null ? t('week.member.planned') : t('week.member.eaten') }}</span>
          </li>
        </ul>
      </BaseCard>
    </template>
  </div>
</template>

<style scoped lang="scss">
.member {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.member h1 {
  margin: 0;
}

.member__back {
  margin: 0;
  font-size: var(--font-size-sm);
}

.member__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.member__days {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
}

.member__notice {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border-radius: var(--radius-md);
}

.member__text {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.member__meals {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.member__meal {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}

/* Même repère que l'accueil : un repas prévu a un trait discontinu, et le dit
   aussi en toutes lettres (critère 1.4.1). */
.member__meal--planned {
  background: transparent;
  border-style: dashed;
  border-color: var(--color-border);
}

.member__meal-type {
  font-weight: 600;
}

.member__meal-kcal {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.member__meal-foods,
.member__meal-state {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
