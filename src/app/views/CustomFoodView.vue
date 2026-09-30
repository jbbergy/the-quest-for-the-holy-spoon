<script setup lang="ts">
/**
 * Création ou modification d'un aliment saisi à la main.
 *
 * Deux adresses, un seul formulaire : `/garde-manger/aliments/nouveau` pour
 * une fiche vierge, `/garde-manger/aliments/:foodId/modifier` pour un de ses
 * propres aliments.
 *
 * Les valeurs sont saisies **pour 100 g**, ou pour 100 ml pour un liquide,
 * comme sur les étiquettes : demander une autre base obligerait à convertir ce
 * qui est écrit sur l'emballage.
 *
 * Les portions sont facultatives : « 1 part = 120 g » permet ensuite de saisir
 * « 2 parts » dans un repas plutôt que de peser.
 */
import { computed, onMounted, ref } from 'vue'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'

import { CONTAINS_OPTIONS, SUITS_OPTIONS } from '@/app/foodTags'
import { ROUTE } from '@/app/router'
import { useBackLink } from '@/app/useBackLink'
import type { FoodItemId } from '@/core/identity'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { t } from '@/i18n'
import type { CustomFoodInput } from '@/modules/nutrition_inventory/application'
import type { FoodItem, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { BaseUnit, MAX_SERVINGS } from '@/modules/nutrition_inventory/domain/Measure'
import { useFoodCatalogStore } from '@/modules/nutrition_inventory/presentation/useFoodCatalogStore'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import RichText from '@/ui/RichText.vue'

const route = useRoute()
const router = useRouter()
const search = useFoodSearchStore()
const catalog = useFoodCatalogStore()
const players = usePlayerStore()

/** Fiche modifiée, ou `null` pour une création. */
const editedId = computed(() =>
  route.name === ROUTE.foodEdit ? (route.params.foodId as FoodItemId) : null,
)
/**
 * Le chemin du retour : le repas d'où l'on vient (`?retour=`), sinon la fiche
 * modifiée, sinon la liste de ses aliments.
 */
const back = useBackLink(
  route.name === ROUTE.foodEdit
    ? {
        to: { name: ROUTE.foodDetail, params: { foodId: String(route.params.foodId) } },
        label: t('shell.titles.food'),
      }
    : { to: { name: ROUTE.foods }, label: t('foods.catalog.title') },
)

/** Fiche introuvable ou pas à soi : le formulaire n'a alors rien à proposer. */
const unavailable = ref(false)

/**
 * Où aller une fois l'aliment créé.
 *
 * Venu d'un repas ou de la liste de courses (`?retour=`), on y revient avec
 * l'aliment présélectionné — seules ces deux adresses sont acceptées : une autre destination
 * n'aurait que faire d'un aliment présélectionné. Sinon, on ouvre la fiche.
 */
function returnTo(foodId: string): RouteLocationRaw {
  const requested = route.query.retour
  if (typeof requested === 'string') {
    const target = router.resolve(requested)
    if (target.name === ROUTE.mealEditor || target.name === ROUTE.shoppingList) {
      return { name: target.name, params: target.params, query: { ...target.query, aliment: foodId } }
    }
  }
  return { name: ROUTE.foodDetail, params: { foodId } }
}

const name = ref('')
const proteinG = ref(0)
const carbsG = ref(0)
const fatG = ref(0)
const fiberG = ref(0)
const sugarsG = ref(0)
const saturatedFatG = ref(0)
const saltG = ref(0)
const barcode = ref('')
const tags = ref<FoodTag[]>([])
const unit = ref<BaseUnit>(BaseUnit.GRAM)
/** Lignes de portion en cours de saisie ; une ligne sans nom est ignorée. */
const servings = ref<{ id: number; label: string; amount: number }[]>([])
let nextServingId = 0
const submitting = ref(false)

const UNIT_OPTIONS = [
  { value: BaseUnit.GRAM, label: 'foods.custom.solid', hint: 'foods.custom.solidHint' },
  { value: BaseUnit.MILLILITRE, label: 'foods.custom.liquid', hint: 'foods.custom.liquidHint' },
] as const

function addServing(): void {
  servings.value = [...servings.value, { id: nextServingId++, label: '', amount: 0 }]
}

function removeServing(id: number): void {
  servings.value = servings.value.filter((serving) => serving.id !== id)
}

/** Aperçu calorique, calculé par les mêmes coefficients que le domaine. */
const calories = computed(
  () =>
    proteinG.value * KCAL_PER_GRAM.protein +
    carbsG.value * KCAL_PER_GRAM.carbs +
    fatG.value * KCAL_PER_GRAM.fat,
)

/**
 * Message du nom manquant, montré à l'envoi : un bouton grisé ne dit pas ce
 * qui manque (critère 3.3.1).
 */
const nameError = ref('')
/** À la création, l'erreur vient de la recherche ; à la relecture ou la modification, du catalogue. */
const error = computed(() => (editedId.value === null ? search.error : null) ?? catalog.error)

function toggleTag(value: FoodTag): void {
  tags.value = tags.value.includes(value)
    ? tags.value.filter((entry) => entry !== value)
    : [...tags.value, value]
}

/**
 * Remplit le formulaire d'après la fiche modifiée. Un aliment saisi à la main
 * a toujours une densité de 1 ; le repli sur le gramme ne sert que par
 * précaution.
 */
function fill(food: FoodItem): void {
  name.value = food.name
  proteinG.value = food.macrosPer100g.proteinG
  carbsG.value = food.macrosPer100g.carbsG
  fatG.value = food.macrosPer100g.fatG
  fiberG.value = food.detailPer100g.fiberG
  sugarsG.value = food.detailPer100g.sugarsG
  saturatedFatG.value = food.detailPer100g.saturatedFatG
  saltG.value = food.detailPer100g.saltG
  barcode.value = food.barcode ?? ''
  tags.value = [...food.tags]
  unit.value = food.density === 1 ? food.unit : BaseUnit.GRAM
  servings.value = food.servings.map((serving) => ({
    id: nextServingId++,
    label: serving.label,
    amount: serving.grams,
  }))
}

onMounted(async () => {
  // Le store est partagé avec la fiche : un refus qui y a été affiché n'a
  // rien à faire sur ce formulaire.
  catalog.clearError()
  const id = editedId.value
  if (id === null) return

  const opened = await catalog.open(id)
  const food = catalog.current
  if (!opened || food === null || !food.isEditableBy(players.playerId)) {
    unavailable.value = true
    return
  }
  fill(food)
})

function input(): CustomFoodInput {
  return {
    name: name.value,
    proteinG: proteinG.value,
    carbsG: carbsG.value,
    fatG: fatG.value,
    fiberG: fiberG.value,
    sugarsG: sugarsG.value,
    saturatedFatG: saturatedFatG.value,
    saltG: saltG.value,
    ...(barcode.value.trim() === '' ? {} : { barcode: barcode.value.trim() }),
    tags: tags.value,
    // L'auteur de la fiche : c'est ce qui permet de la partager avec le foyer.
    ownerId: players.playerId,
    unit: unit.value,
    servings: servings.value
      .filter((serving) => serving.label.trim() !== '')
      .map((serving) => ({ label: serving.label, grams: serving.amount })),
  }
}

async function submit(): Promise<void> {
  if (name.value.trim() === '') {
    nameError.value = t('foods.custom.nameRequired')
    document.querySelector<HTMLElement>('.custom [aria-invalid="true"]')?.focus()
    return
  }
  nameError.value = ''
  submitting.value = true
  const id = editedId.value
  const saved =
    id === null
      ? await search.createCustomFood(input())
      : await catalog.update(id, input(), players.playerId)
  submitting.value = false

  if (saved === null) return
  await router.push(id === null ? returnTo(saved.id) : { name: ROUTE.foodDetail, params: { foodId: id } })
}

const title = computed(() =>
  editedId.value === null ? t('foods.custom.create') : t('foods.custom.edit'),
)
</script>

<template>
  <div class="custom">
    <RouterLink
      class="custom__back"
      :to="back.to"
    >
      <span aria-hidden="true">←</span> {{ back.label }}
    </RouterLink>

    <h1>{{ title }}</h1>

    <ErrorNotice :error="error" />

    <EmptyState
      v-if="unavailable"
      :title="t('foods.custom.cannotEditTitle')"
      :description="t('foods.custom.cannotEditDescription')"
    />

    <p
      v-if="!unavailable"
      class="custom__intro"
    >
      <RichText
        path="foods.custom.intro"
        :params="{ unit }"
      />
    </p>

    <form
      v-if="!unavailable"
      class="custom__form"
      novalidate
      @submit.prevent="submit"
    >
      <BaseCard :title="t('foods.custom.nameCard')">
        <BaseField
          v-model="name"
          :label="t('foods.custom.nameLabel')"
          :hint="t('foods.custom.nameHint')"
          required
          v-bind="nameError === '' ? {} : { error: nameError }"
          @update:model-value="nameError = ''"
        />
        <BaseField
          v-model="barcode"
          :label="t('foods.custom.barcodeLabel')"
          :hint="t('foods.custom.barcodeHint')"
        />
      </BaseCard>

      <BaseCard :title="t('foods.custom.unitTitle')">
        <fieldset class="custom__fieldset">
          <legend class="sr-only">
            {{ t('foods.custom.unitTitle') }}
          </legend>
          <div class="custom__choices">
            <label
              v-for="option in UNIT_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                v-model="unit"
                type="radio"
                name="unit"
                :value="option.value"
              >
              <span>
                <strong>{{ t(option.label) }}</strong>
                <small>{{ t(option.hint) }}</small>
              </span>
            </label>
          </div>
        </fieldset>
      </BaseCard>

      <BaseCard
        :title="t('foods.custom.per', { unit })"
        :subtitle="t('foods.custom.kcal', { kcal: Math.round(calories) })"
      >
        <div class="custom__grid">
          <BaseField
            v-model="proteinG"
            :label="t('labels.nutrient.protein')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="carbsG"
            :label="t('labels.nutrient.carbs')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="fatG"
            :label="t('labels.nutrient.fat')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
        </div>
      </BaseCard>

      <BaseCard
        :title="t('foods.custom.othersTitle')"
        :subtitle="t('foods.custom.othersSubtitle')"
      >
        <div class="custom__grid">
          <BaseField
            v-model="fiberG"
            :label="t('labels.nutrient.fiber')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="sugarsG"
            :label="t('labels.nutrient.sugars')"
            :hint="t('foods.custom.sugarsHint')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="saturatedFatG"
            :label="t('labels.nutrient.saturatedFat')"
            :hint="t('foods.custom.saturatedFatHint')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="saltG"
            :label="t('labels.nutrient.salt')"
            type="number"
            suffix="g"
            :min="0"
            :step="0.01"
          />
        </div>
      </BaseCard>

      <BaseCard
        :title="t('foods.custom.servingsTitle')"
        :subtitle="t('foods.custom.servingsSubtitle')"
      >
        <ul
          v-if="servings.length > 0"
          class="custom__servings"
        >
          <li
            v-for="(serving, index) in servings"
            :key="serving.id"
            class="custom__serving"
          >
            <BaseField
              v-model="serving.label"
              :label="t('foods.custom.servingName', { n: index + 1 })"
              :hint="t('foods.custom.servingHint')"
            />
            <BaseField
              v-model="serving.amount"
              :label="unit === 'ml' ? t('foods.custom.volume') : t('foods.custom.weight')"
              type="number"
              :suffix="unit"
              :min="0"
              :step="1"
            />
            <BaseButton
              variant="ghost"
              size="sm"
              @click="removeServing(serving.id)"
            >
              <span aria-hidden="true">×</span>
              <span class="sr-only">{{ t('foods.custom.removeServing', { n: index + 1 }) }}</span>
            </BaseButton>
          </li>
        </ul>
        <BaseButton
          v-if="servings.length < MAX_SERVINGS"
          variant="secondary"
          size="sm"
          @click="addServing"
        >
          {{ t('foods.custom.addServing') }}
        </BaseButton>
      </BaseCard>

      <BaseCard
        :title="t('foods.custom.dietsTitle')"
        :subtitle="t('foods.custom.dietsSubtitle')"
      >
        <fieldset class="custom__fieldset">
          <legend class="custom__legend">
            {{ t('foods.custom.contains') }}
          </legend>
          <div class="custom__choices">
            <label
              v-for="option in CONTAINS_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                type="checkbox"
                :value="option.value"
                :checked="tags.includes(option.value)"
                @change="toggleTag(option.value)"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="custom__fieldset">
          <legend class="custom__legend">
            {{ t('foods.custom.suits') }}
          </legend>
          <div class="custom__choices">
            <label
              v-for="option in SUITS_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                type="checkbox"
                :value="option.value"
                :checked="tags.includes(option.value)"
                @change="toggleTag(option.value)"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
      </BaseCard>

      <BaseButton
        type="submit"
        block
        :loading="submitting"
      >
        {{ editedId === null ? t('foods.custom.submitCreate') : t('foods.custom.save') }}
      </BaseButton>
    </form>
  </div>
</template>

<style scoped lang="scss">
.custom {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.custom__back {
  align-self: flex-start;
}

.custom h1,
.custom__intro {
  margin: 0;
}

.custom__intro {
  color: var(--color-text-muted);
}

.custom__legend {
  padding: 0;
  margin-bottom: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.custom__fieldset + .custom__fieldset {
  margin-top: var(--space-4);
}

.custom__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.custom__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-3);
}

.custom__servings {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
}

.custom__serving {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 8rem) auto;
  align-items: end;
  gap: var(--space-2);
}

.custom__fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.custom__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.choice span {
  display: flex;
  flex-direction: column;
}

.choice small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 400;
}

.choice input {
  flex: none;
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  font-weight: 600;
}
</style>
