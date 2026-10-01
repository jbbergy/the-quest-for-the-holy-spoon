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
import { useRoute, useRouter } from 'vue-router'

import DayOverview from '@/app/components/DayOverview.vue'
import MemberMeals from '@/app/components/MemberMeals.vue'
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
import { lower, t, upperFirst } from '@/i18n'
import AppIcon from '@/ui/AppIcon.vue'
import BackLink from '@/ui/BackLink.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

import { nameParams } from '@/app/household/householdFormat'

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

/** Pas au-delà d'aujourd'hui : le bouton le dit, sans quitter l'ordre du clavier. */
const canGoForward = computed(() => day.value < today.value)
function forward(): void {
  if (canGoForward.value) void goTo(addDays(day.value, 1))
}
</script>

<template>
  <div class="member">
    <BackLink
      :to="{ name: ROUTE.household }"
      :label="t('week.member.back')"
    />

    <h1>{{ name }}</h1>

    <nav
      class="member__days"
      :aria-label="t('week.member.changeDay')"
    >
      <button
        type="button"
        class="member__arrow"
        @click="goTo(addDays(day, -1))"
      >
        <AppIcon name="chevron-left" />
        <span class="sr-only">{{ t('week.member.previousDay') }}</span>
      </button>
      <p class="member__day">
        {{ day === today ? t('week.member.today') : upperFirst(formatDay(day)) }}
      </p>
      <button
        type="button"
        class="member__arrow"
        :aria-disabled="canGoForward ? undefined : 'true'"
        @click="forward"
      >
        <AppIcon name="chevron-right" />
        <span class="sr-only">{{ t('week.member.nextDay') }}</span>
      </button>
    </nav>

    <p
      v-if="error?.code === 'DAYS_NOT_SHARED'"
      class="member__notice"
      role="status"
    >
      <AppIcon
        name="lock"
        class="member__notice-icon"
      />
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
        member
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
      >
        <template #after-calories>
          <MemberMeals
            :title="t('week.member.mealsTitle', nameParams(name))"
            :meals="meals"
          />
        </template>
      </DayOverview>

      <template v-else>
        <p class="member__notice">
          {{ t('week.member.gaugesNotReady', nameParams(name)) }}
        </p>
        <MemberMeals
          :title="t('week.member.mealsTitle', nameParams(name))"
          :meals="meals"
        />
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.member {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);

  h1 {
    margin: 0;
    overflow-wrap: break-word;
  }
}

/* Changer de jour : deux flèches rondes autour du jour affiché. */
.member__days {
  display: flex;
  max-width: 28rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.member__day {
  margin: 0;
  font-weight: 700;
  text-align: center;
}

.member__arrow {
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

  /* Aujourd'hui, pas de jour suivant : un trait discontinu, et le curseur. */
  &[aria-disabled='true'] {
    border-style: dashed;
    background: transparent;
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}

.member__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.member__notice-icon {
  flex-shrink: 0;
  margin-top: 0.15em;
}

.member__text {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
