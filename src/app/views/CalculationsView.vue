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
import AppIcon from '@/ui/AppIcon.vue'
import BackLink from '@/ui/BackLink.vue'
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
    <BackLink
      :to="{ name: ROUTE.settings }"
      :label="t('shell.nav.settings')"
    />

    <header class="calculations__header">
      <h1>{{ t('calculations.title') }}</h1>
      <p class="calculations__intro">
        {{ t('calculations.intro') }}
      </p>
    </header>

    <!-- Le résultat d'abord : ce que la page va expliquer. -->
    <section
      v-if="body"
      class="yours"
      aria-labelledby="vos-reperes"
    >
      <h2
        id="vos-reperes"
        class="yours__title"
      >
        {{ t('calculations.yours.title') }}
      </h2>
      <dl class="yours__figures">
        <div class="yours__main">
          <dt>{{ t('calculations.yours.need') }}</dt>
          <dd class="figure">
            {{ t('calculations.yours.kcal', { kcal: body.need }) }}
          </dd>
        </div>
        <div>
          <dt>{{ t('calculations.yours.rest') }}</dt>
          <dd>{{ t('calculations.yours.kcal', { kcal: body.rest }) }}</dd>
        </div>
        <div>
          <dt>{{ t('calculations.yours.activity') }}</dt>
          <dd>× {{ body.multiplier }}</dd>
        </div>
      </dl>
    </section>

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
      <ol
        class="calculations__steps"
        role="list"
      >
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
      <ol
        class="calculations__steps"
        role="list"
      >
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
      <ol
        class="calculations__steps"
        role="list"
      >
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
      <AppIcon
        name="leaf"
        class="calculations__caveat-icon"
      />
      {{ t('calculations.caveat') }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.calculations {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.calculations h1,
.calculations p {
  margin: 0;
}

.calculations__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  h1 {
    overflow-wrap: break-word;
  }
}

.calculations__intro {
  color: var(--color-text-muted);
}

/* Vos repères : l'encart foncé, le besoin en chiffre de titre. */
.yours {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-padding);
  background: var(--color-inverse);
  border-radius: var(--radius-xl);
  color: var(--color-on-inverse);
}

.yours .yours__title {
  margin: 0;
  color: var(--color-on-inverse-muted);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.yours__figures {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-5);
  margin: 0;

  div {
    display: flex;
    flex-direction: column;
  }

  dt {
    color: var(--color-on-inverse-muted);
    font-size: var(--font-size-sm);
  }

  dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.yours__main {
  flex-basis: 100%;

  dd {
    font-size: var(--font-size-2xl);
    font-weight: 400;
    line-height: 1.1;
  }
}

.calculations__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-5);
}

/* Les étapes : un numéro dans une pastille, puis le texte. `role="list"`
   garde la liste annoncée comme telle, même sans puces. */
.calculations__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
  counter-reset: step;

  > li {
    position: relative;
    min-height: 2rem;
    padding-left: calc(2rem + var(--space-3));
    counter-increment: step;

    &::before {
      content: counter(step);
      position: absolute;
      top: -0.1em;
      left: 0;
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--color-accent-soft);
      color: var(--color-accent-strong);
      font-weight: 700;
    }
  }
}

/* Votre propre calcul, sous la règle : un encart Feuille pâle. */
.calculations__mine {
  display: block;
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-accent-soft);
  border-left: 3px solid var(--color-accent);
  border-radius: var(--radius-sm);
  color: var(--color-accent-strong);
  font-variant-numeric: tabular-nums;
  overflow-wrap: break-word;
}

/* L'exemple : l'encart safran pâle des conseils. */
.calculations .calculations__example {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-saffron-soft);
  border-radius: var(--radius-md);
  color: var(--color-on-saffron-soft);
  overflow-wrap: break-word;
}

/* Les répartitions : des lignes séparées par un filet. */
.calculations__table {
  margin: var(--space-3) 0;

  div {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) 0;
  }

  div + div {
    border-top: 1px solid var(--color-divider);
  }

  dt {
    font-weight: 700;
  }

  dd {
    margin: 0;
    overflow-wrap: break-word;
  }
}

.calculations__caveat {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.calculations__caveat-icon {
  flex-shrink: 0;
  margin-top: 0.15em;
}
</style>
