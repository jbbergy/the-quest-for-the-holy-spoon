<script setup lang="ts">
/**
 * Création d'une fiche d'aliment.
 *
 * Les valeurs sont saisies **pour 100 g**, comme dans toutes les tables
 * nutritionnelles : c'est la base que le domaine attend, et demander une autre
 * unité obligerait l'utilisateur à convertir ce qui est écrit sur l'emballage.
 */
import { computed, ref } from 'vue'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const route = useRoute()
const router = useRouter()

/**
 * Où revenir une fois l'aliment créé, avec l'aliment présélectionné.
 *
 * Le repas d'où l'on vient, s'il est donné dans `?retour=` ; sinon un nouveau
 * repas pour aujourd'hui. Seule une adresse d'éditeur de repas est acceptée :
 * une autre destination n'aurait que faire d'un aliment présélectionné.
 */
function returnTo(foodId: string): RouteLocationRaw {
  const requested = route.query.retour
  if (typeof requested === 'string') {
    const target = router.resolve(requested)
    if (target.name === ROUTE.mealEditor) {
      return { name: ROUTE.mealEditor, params: target.params, query: { ...target.query, aliment: foodId } }
    }
  }
  return { name: ROUTE.mealEditor, query: { aliment: foodId } }
}
const search = useFoodSearchStore()

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
const submitting = ref(false)

const TAG_OPTIONS = [
  { value: FoodTag.VEGETARIAN, label: 'Végétarien' },
  { value: FoodTag.VEGAN, label: 'Végan' },
  { value: FoodTag.GLUTEN_FREE, label: 'Sans gluten' },
  { value: FoodTag.LACTOSE_FREE, label: 'Sans lactose' },
  { value: FoodTag.CONTAINS_MEAT, label: 'Contient de la viande' },
  { value: FoodTag.CONTAINS_FISH, label: 'Contient du poisson' },
  { value: FoodTag.CONTAINS_NUTS, label: 'Contient des fruits à coque' },
] as const

/** Aperçu calorique, calculé par les mêmes coefficients que le domaine. */
const calories = computed(
  () =>
    proteinG.value * KCAL_PER_GRAM.protein +
    carbsG.value * KCAL_PER_GRAM.carbs +
    fatG.value * KCAL_PER_GRAM.fat,
)

const canSubmit = computed(() => name.value.trim().length > 0 && !submitting.value)

function toggleTag(value: FoodTag): void {
  tags.value = tags.value.includes(value)
    ? tags.value.filter((entry) => entry !== value)
    : [...tags.value, value]
}

async function submit(): Promise<void> {
  submitting.value = true
  const created = await search.createCustomFood({
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
  })
  submitting.value = false

  if (created !== null) await router.push(returnTo(created.id))
}
</script>

<template>
  <div class="custom">
    <h1>Nouvel aliment</h1>
    <p class="custom__intro">
      Renseignez les valeurs <strong>pour 100 g</strong>, telles qu’indiquées sur l’emballage.
    </p>

    <ErrorNotice :error="search.error" />

    <form
      class="custom__form"
      novalidate
      @submit.prevent="submit"
    >
      <BaseCard title="Identification">
        <BaseField
          v-model="name"
          label="Nom"
          required
          placeholder="Tarte aux pommes maison"
        />
        <BaseField
          v-model="barcode"
          label="Code-barres"
          hint="Facultatif — 8 à 14 chiffres, pour retrouver la fiche au scan."
          placeholder="3017620422003"
        />
      </BaseCard>

      <BaseCard
        title="Valeurs pour 100 g"
        :subtitle="`Soit ${Math.round(calories)} kcal`"
      >
        <div class="custom__grid">
          <BaseField
            v-model="proteinG"
            label="Protéines"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="carbsG"
            label="Glucides"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="fatG"
            label="Lipides"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
        </div>
      </BaseCard>

      <BaseCard
        title="Détail nutritionnel"
        subtitle="Facultatif — ce qui reste à zéro n’alimente simplement aucune jauge."
      >
        <div class="custom__grid">
          <BaseField
            v-model="fiberG"
            label="Fibres"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="sugarsG"
            label="dont sucres"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="saturatedFatG"
            label="dont AG saturés"
            type="number"
            suffix="g"
            :min="0"
            :step="0.1"
          />
          <BaseField
            v-model="saltG"
            label="Sel"
            type="number"
            suffix="g"
            :min="0"
            :step="0.01"
          />
        </div>
      </BaseCard>

      <BaseCard
        title="Marqueurs"
        subtitle="Facultatif — servent à écarter l’aliment d’un régime incompatible."
      >
        <fieldset class="custom__fieldset">
          <legend class="sr-only">
            Marqueurs diététiques
          </legend>
          <div class="custom__choices">
            <label
              v-for="option in TAG_OPTIONS"
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
        :disabled="!canSubmit"
        :loading="submitting"
      >
        Créer l’aliment
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

.custom__intro {
  color: var(--color-text-muted);
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

.choice input {
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
