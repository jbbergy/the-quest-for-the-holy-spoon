<script setup lang="ts">
/**
 * Un aliment saisi à la main, et ce qu'on a le droit d'en faire.
 *
 * Le sien se modifie et se supprime ; ses changements partent au serveur avec
 * le reste du compte. Celui d'un autre membre du foyer se consulte seulement :
 * c'est à son auteur de le corriger.
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { tagLabel } from '@/app/foodTags'
import { formatWeight, per100Label } from '@/app/portionFormat'
import { usePageTitle } from '@/app/pageTitle'
import { ROUTE } from '@/app/router'
import { useReturnQuery } from '@/app/useBackLink'
import { foodAuthor, useHousehold } from '@/app/useHousehold'
import type { FoodItemId } from '@/core/identity'
import { numberFormat, t } from '@/i18n'
import { FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { servingMeasure } from '@/modules/nutrition_inventory/domain/Measure'
import { useFoodCatalogStore } from '@/modules/nutrition_inventory/presentation/useFoodCatalogStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BackLink from '@/ui/BackLink.vue'
import BaseButton from '@/ui/BaseButton.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'
import RichText from '@/ui/RichText.vue'

const route = useRoute()
const router = useRouter()
const catalog = useFoodCatalogStore()
const players = usePlayerStore()
const household = useHousehold()
const returnQuery = useReturnQuery()

const food = computed(() => catalog.current)
const canEdit = computed(() => food.value?.isEditableBy(players.playerId) ?? false)
const author = computed(() =>
  food.value === null ? null : foodAuthor(household.household, players.playerId, food.value.ownerId),
)
usePageTitle(() => food.value?.name ?? t('shell.titles.food'))

const per100 = computed(() => (food.value === null ? '100 g' : per100Label(food.value)))

/** Pourquoi la fiche ne se modifie pas : on le dit plutôt que de cacher le bouton sans un mot. */
const readOnlyReason = computed(() => {
  if (food.value === null || canEdit.value) return null
  if (food.value.source !== FoodSource.USER) {
    return t('foods.detail.readOnlyCatalog')
  }
  return t('foods.detail.readOnlyAuthor', {
    author: author.value ?? t('foods.detail.anotherMember'),
  })
})

onMounted(() => catalog.open(route.params.foodId as FoodItemId))

async function remove(): Promise<void> {
  if (food.value === null) return
  if (await catalog.remove(food.value.id, players.playerId)) {
    await router.push({ name: ROUTE.foods })
  }
}

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)
const grams = (value: number, digits = 1): string =>
  numberFormat({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)

const MACROS = [
  { key: 'proteinG', label: 'protein' },
  { key: 'carbsG', label: 'carbs' },
  { key: 'fatG', label: 'fat' },
] as const

const NUTRIENTS = [
  { key: 'fiberG', label: 'fiber' },
  { key: 'sugarsG', label: 'sugars' },
  { key: 'saturatedFatG', label: 'saturatedFat' },
  { key: 'saltG', label: 'salt' },
] as const
</script>

<template>
  <div class="food">
    <BackLink
      :to="{ name: ROUTE.foods }"
      :label="t('foods.pantry.title')"
    />

    <ErrorNotice :error="catalog.error" />

    <EmptyState
      v-if="food === null && catalog.status !== 'loading'"
      :title="t('foods.detail.notFoundTitle')"
      :description="t('foods.detail.notFoundDescription')"
    />

    <template v-else-if="food">
      <header class="food__title">
        <h1>{{ food.name }}</h1>
        <FoodSourceTag
          :source="food.source"
          :author="author"
        />
      </header>

      <!-- Les valeurs : l'énergie en grand, les trois macronutriments, puis le reste. -->
      <section
        class="values"
        aria-labelledby="valeurs"
      >
        <h2
          id="valeurs"
          class="eyebrow values__title"
        >
          {{ t('foods.detail.per', { per: per100 }) }}
        </h2>
        <p class="values__energy">
          <span class="figure values__kcal">{{ kcal(food.macrosPer100g.calories()) }}</span>
          <span class="values__unit">kcal</span>
        </p>
        <dl class="values__macros">
          <div
            v-for="macro in MACROS"
            :key="macro.key"
          >
            <dt>{{ t(`labels.nutrient.${macro.label}`) }}</dt>
            <dd>{{ grams(food.macrosPer100g[macro.key]) }} g</dd>
          </div>
        </dl>
        <dl class="values__others">
          <div
            v-for="nutrient in NUTRIENTS"
            :key="nutrient.key"
          >
            <dt>{{ t(`labels.nutrient.${nutrient.label}`) }}</dt>
            <dd>{{ grams(food.detailPer100g[nutrient.key], nutrient.key === 'saltG' ? 2 : 1) }} g</dd>
          </div>
        </dl>
      </section>

      <section
        class="list-group"
        aria-labelledby="portions"
      >
        <h2
          id="portions"
          class="eyebrow list-group__title"
        >
          {{ t('foods.detail.portionsTitle') }}
        </h2>
        <ul
          v-if="food.servings.length > 0"
          class="list-rows"
        >
          <li
            v-for="serving in food.servings"
            :key="serving.label"
            class="list-row"
          >
            <span class="list-row__label">{{ t('foods.detail.serving', { label: serving.label }) }}</span>
            <span class="list-row__value">{{ formatWeight(serving.grams, servingMeasure(serving), food.baseMeasure) }}</span>
          </li>
        </ul>
        <p class="list-group__note">
          <template v-if="food.servings.length === 0">
            {{ food.unit === 'ml' ? t('foods.detail.noServingsMl') : t('foods.detail.noServingsG') }}
          </template>
          <template v-else>
            {{ food.unit === 'ml' ? t('foods.detail.liquid') : t('foods.detail.solid') }}
          </template>
        </p>
      </section>

      <section
        v-if="food.barcode || food.tags.length > 0"
        class="list-group"
        aria-labelledby="autres-informations"
      >
        <h2
          id="autres-informations"
          class="eyebrow list-group__title"
        >
          {{ t('foods.detail.otherInfo') }}
        </h2>
        <div class="list-rows">
          <p
            v-if="food.barcode"
            class="list-row"
          >
            <RichText path="foods.detail.barcode">
              <template #code>
                <span class="food__code">{{ food.barcode }}</span>
              </template>
            </RichText>
          </p>
          <ul
            v-if="food.tags.length > 0"
            class="list-row food__tags"
          >
            <li
              v-for="tag in food.tags"
              :key="tag"
            >
              {{ tagLabel(tag) }}
            </li>
          </ul>
        </div>
      </section>

      <p
        v-if="readOnlyReason"
        class="food__note"
      >
        <AppIcon
          name="lock"
          class="food__note-icon"
        />
        {{ readOnlyReason }}
      </p>

      <div class="food__actions">
        <BaseButton
          @click="router.push({ name: ROUTE.mealEditor, query: { aliment: food.id, ...returnQuery } })"
        >
          {{ t('foods.detail.addToMeal') }}
        </BaseButton>
        <BaseButton
          v-if="canEdit"
          variant="secondary"
          @click="router.push({ name: ROUTE.foodEdit, params: { foodId: food.id } })"
        >
          {{ t('foods.detail.edit') }}
        </BaseButton>
        <ConfirmButton
          v-if="canEdit"
          class="food__delete"
          :question="t('foods.detail.deleteQuestion', { name: food.name })"
          :confirm-label="t('foods.detail.delete')"
          :loading="catalog.status === 'loading'"
          @confirm="remove"
        >
          <AppIcon name="trash" />
          {{ t('foods.detail.delete') }}
        </ConfirmButton>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.food {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.food__title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: calc(-1 * var(--space-3));

  h1 {
    margin: 0;
    overflow-wrap: break-word;
  }
}

/* Les valeurs : une carte, l'énergie en chiffre de titre. */
.values {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}

.values__title {
  margin: 0;
}

.values__energy {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  margin: calc(-1 * var(--space-2)) 0 0;
}

.values__kcal {
  font-size: var(--font-size-2xl);
  line-height: 1;
}

.values__unit {
  color: var(--color-text-muted);
}

.values__macros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);

  div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  dt {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  dd {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.values__others {
  margin: 0;

  div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 var(--space-3);
    padding: var(--space-2) 0;
  }

  div + div {
    border-top: 1px solid var(--color-divider);
  }

  dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

/* Groupes de lignes (`styles/_list-rows.scss`) : l'intitulé et la valeur aux
   deux bords. */
.list-row {
  justify-content: space-between;
}

.food__code {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.food__tags {
  justify-content: flex-start;
  gap: var(--space-2);
  list-style: none;

  li {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-sm);
  }
}

.food__note {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.food__note-icon {
  flex-shrink: 0;
  margin-top: 0.15em;
}

.food__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.food__delete {
  align-self: flex-start;
}
</style>
