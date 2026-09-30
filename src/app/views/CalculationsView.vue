<script setup lang="ts">
/**
 * Comment sont calculés les repères : la page qui explique, pas à pas, d'où
 * viennent les chiffres — ceux des aliments et ceux de la personne.
 *
 * Les nombres de la personne sont **lus sur son profil**, pas recopiés : la
 * page montre son propre calcul, ce qui l'explique mieux qu'une formule seule.
 * Les constantes (répartition, repères, coefficients) viennent du domaine, si
 * bien que la page ne peut pas dire autre chose que le code.
 *
 * Les textes suivent les règles FALC du lexique : phrases courtes, une idée
 * par phrase, mots courants.
 */
import { computed } from 'vue'

import { ACTIVITY_OPTIONS } from '@/app/profileOptions'
import { ROUTE } from '@/app/router'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { lower, numberFormat, t } from '@/i18n'
import { RECENT_DAYS } from '@/modules/planning/domain/RecentIntakeService'
import { ACTIVITY_MULTIPLIER } from '@/modules/player_profile/domain/ActivityLevel'
import { BALANCED_MACRO_SPLIT, SATURATED_FAT_ENERGY_SHARE } from '@/modules/player_profile/domain/BalancedDiet'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseCard from '@/ui/BaseCard.vue'
import RichText from '@/ui/RichText.vue'

const players = usePlayerStore()
const view = computed(() => players.profileView)

const number = { format: (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value) }
const decimal = { format: (value: number): string => numberFormat({ maximumFractionDigits: 2 }).format(value) }
const percent = (share: number): string => `${number.format(share * 100)} %`

/** Un aliment d'exemple : 100 g de pâtes cuites, à peu près. */
const EXAMPLE = { proteinG: 5, carbsG: 25, fatG: 1, grams: 200 } as const
const exampleKcalPer100g =
  EXAMPLE.proteinG * KCAL_PER_GRAM.protein +
  EXAMPLE.carbsG * KCAL_PER_GRAM.carbs +
  EXAMPLE.fatG * KCAL_PER_GRAM.fat

const body = computed(() => {
  const v = view.value
  if (v === null) return null
  const male = v.biologicalSex === BiologicalSex.MALE
  const activity = ACTIVITY_OPTIONS.find((option) => option.value === v.activityLevel)
  return {
    weight: decimal.format(v.weightKg),
    height: decimal.format(v.heightCm),
    age: v.ageYears,
    sexLabel: male ? t('calculations.need.sexMale') : t('calculations.need.sexFemale'),
    sexTerm: male ? '+ 5' : '− 161',
    activityLabel: activity === undefined ? '' : lower(activity.label),
    multiplier: decimal.format(ACTIVITY_MULTIPLIER[v.activityLevel]),
    rest: number.format(v.basalMetabolicRate),
    need: number.format(v.targetCalories),
    protein: number.format(v.targetMacros.proteinG),
    carbs: number.format(v.targetMacros.carbsG),
    fat: number.format(v.targetMacros.fatG),
    saturatedFat: number.format(v.referenceNutrients.saturatedFatG),
  }
})

const split = {
  protein: percent(BALANCED_MACRO_SPLIT.protein),
  carbs: percent(BALANCED_MACRO_SPLIT.carbs),
  fat: percent(BALANCED_MACRO_SPLIT.fat),
  saturatedFat: percent(SATURATED_FAT_ENERGY_SHARE),
}
</script>

<template>
  <div class="calculations">
    <RouterLink
      class="calculations__back"
      :to="{ name: ROUTE.settings }"
    >
      <span aria-hidden="true">←</span> {{ t('shell.nav.settings') }}
    </RouterLink>

    <h1>{{ t('calculations.title') }}</h1>
    <p>{{ t('calculations.intro') }}</p>

    <BaseCard
      :title="t('calculations.foods.title')"
      :subtitle="t('calculations.foods.subtitle')"
    >
      <ul class="calculations__list">
        <li><RichText path="calculations.foods.ciqual" /></li>
        <li><RichText path="calculations.foods.off" /></li>
        <li>{{ t('calculations.foods.own') }}</li>
        <li><RichText path="calculations.foods.per100" /></li>
      </ul>
    </BaseCard>

    <BaseCard
      :title="t('calculations.eaten.title')"
      :subtitle="t('calculations.eaten.subtitle')"
    >
      <ol class="calculations__steps">
        <li><RichText path="calculations.eaten.portions" /></li>
        <li><RichText path="calculations.eaten.crossProduct" /></li>
        <li>
          <RichText
            path="calculations.eaten.calories"
            :params="{
              protein: KCAL_PER_GRAM.protein,
              carbs: KCAL_PER_GRAM.carbs,
              fat: KCAL_PER_GRAM.fat,
            }"
          />
        </li>
      </ol>
      <p class="calculations__example">
        <RichText
          path="calculations.eaten.example"
          :params="{
            proteinG: EXAMPLE.proteinG,
            carbsG: EXAMPLE.carbsG,
            fatG: EXAMPLE.fatG,
            protein: KCAL_PER_GRAM.protein,
            carbs: KCAL_PER_GRAM.carbs,
            fat: KCAL_PER_GRAM.fat,
            per100: exampleKcalPer100g,
            grams: EXAMPLE.grams,
            factor: EXAMPLE.grams / 100,
            total: exampleKcalPer100g * (EXAMPLE.grams / 100),
          }"
        />
      </p>
      <ul class="calculations__list">
        <li>{{ t('calculations.eaten.others') }}</li>
        <li>{{ t('calculations.eaten.missing') }}</li>
        <li><RichText path="calculations.eaten.onlyEaten" /></li>
        <li>{{ t('calculations.eaten.frozen') }}</li>
      </ul>
    </BaseCard>

    <BaseCard
      v-if="body"
      :title="t('calculations.need.title')"
      :subtitle="t('calculations.need.subtitle')"
    >
      <ol class="calculations__steps">
        <li>
          <RichText
            path="calculations.need.resting"
            :params="{ sexTerm: body.sexTerm, sexLabel: body.sexLabel }"
          />
          <span class="calculations__mine">
            <RichText
              path="calculations.need.restingMine"
              :params="{
                weight: body.weight,
                height: body.height,
                age: body.age,
                sexTerm: body.sexTerm,
                rest: body.rest,
              }"
            />
          </span>
        </li>
        <li>
          <RichText
            path="calculations.need.withActivity"
            :params="{ activity: body.activityLabel }"
          />
          <span class="calculations__mine">
            <RichText
              path="calculations.need.withActivityMine"
              :params="{ rest: body.rest, multiplier: body.multiplier, need: body.need }"
            />
          </span>
        </li>
      </ol>
      <p>{{ t('calculations.need.note') }}</p>
    </BaseCard>

    <BaseCard
      v-if="body"
      :title="t('calculations.macros.title')"
      :subtitle="t('calculations.macros.subtitle')"
    >
      <p>{{ t('calculations.macros.intro') }}</p>
      <dl class="calculations__table">
        <div>
          <dt>{{ t('labels.nutrient.protein') }}</dt>
          <dd>
            <RichText
              path="calculations.macros.line"
              :params="{
                share: split.protein,
                need: body.need,
                kcalPerGram: KCAL_PER_GRAM.protein,
                grams: body.protein,
              }"
            />
          </dd>
        </div>
        <div>
          <dt>{{ t('labels.nutrient.carbs') }}</dt>
          <dd>
            <RichText
              path="calculations.macros.line"
              :params="{
                share: split.carbs,
                need: body.need,
                kcalPerGram: KCAL_PER_GRAM.carbs,
                grams: body.carbs,
              }"
            />
          </dd>
        </div>
        <div>
          <dt>{{ t('labels.nutrient.fat') }}</dt>
          <dd>
            <RichText
              path="calculations.macros.line"
              :params="{
                share: split.fat,
                need: body.need,
                kcalPerGram: KCAL_PER_GRAM.fat,
                grams: body.fat,
              }"
            />
          </dd>
        </div>
      </dl>
    </BaseCard>

    <BaseCard
      v-if="body"
      :title="t('calculations.limits.title')"
      :subtitle="t('calculations.limits.subtitle')"
    >
      <dl class="calculations__table">
        <div>
          <dt>{{ t('labels.nutrient.fiber') }}</dt>
          <dd><RichText path="calculations.limits.fiber" /></dd>
        </div>
        <div>
          <dt>{{ t('labels.nutrient.sugars') }}</dt>
          <dd><RichText path="calculations.limits.sugars" /></dd>
        </div>
        <div>
          <dt>{{ t('labels.nutrient.saturatedFat') }}</dt>
          <dd>
            <RichText
              path="calculations.limits.saturatedFat"
              :params="{
                share: split.saturatedFat,
                need: body.need,
                kcalPerGram: KCAL_PER_GRAM.fat,
                grams: body.saturatedFat,
              }"
            />
          </dd>
        </div>
        <div>
          <dt>{{ t('labels.nutrient.salt') }}</dt>
          <dd><RichText path="calculations.limits.salt" /></dd>
        </div>
      </dl>
      <p>{{ t('calculations.limits.sugarsNote') }}</p>
    </BaseCard>

    <BaseCard
      :title="t('calculations.average.title')"
      :subtitle="t('calculations.average.subtitle')"
    >
      <ol class="calculations__steps">
        <li>
          <RichText
            path="calculations.average.days"
            :params="{ n: RECENT_DAYS }"
          />
        </li>
        <li><RichText path="calculations.average.ignored" /></li>
        <li>{{ t('calculations.average.compare') }}</li>
      </ol>
      <p><RichText path="calculations.average.note" /></p>
    </BaseCard>

    <p class="calculations__caveat">
      {{ t('calculations.caveat') }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.calculations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.calculations h1,
.calculations p {
  margin: 0;
}

.calculations__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  color: var(--color-text-muted);
  text-decoration: none;

  &:hover {
    color: var(--color-text);
  }
}

.calculations__list,
.calculations__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-5);
}

.calculations__mine {
  display: block;
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow-wrap: break-word;
}

.calculations .calculations__example {
  margin-bottom: var(--space-3);
}

.calculations__table {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-3) 0;

  div {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    overflow-wrap: break-word;
  }
}

.calculations__caveat {
  color: var(--color-text-muted);
}
</style>
