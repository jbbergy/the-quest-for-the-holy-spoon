<script setup lang="ts">
/**
 * Composition d'un repas.
 *
 * L'ajout passe par `useDailyTracking.logFood`, qui enregistre **puis** relit la
 * progression : le gain d'XP apparaît donc dans la même interaction, sans que ce
 * composant n'ait à connaître le contexte `gamification`.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { ROUTE } from '@/app/router'
import { useDailyTracking } from '@/app/useDailyTracking'
import type { FoodItemId } from '@/core/identity'
import { MealType } from '@/modules/nutrition_inventory/application'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import { useJournalStore } from '@/modules/nutrition_inventory/presentation/useJournalStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const route = useRoute()
const players = usePlayerStore()
const journal = useJournalStore()
const search = useFoodSearchStore()
const tracking = useDailyTracking()

const query = ref('')
const grams = ref(100)
const mealType = ref<MealType>(MealType.LUNCH)
const selectedId = ref<FoodItemId | null>(null)
const feedback = ref('')

const MEAL_OPTIONS = [
  { value: MealType.BREAKFAST, label: 'Petit-déjeuner' },
  { value: MealType.LUNCH, label: 'Déjeuner' },
  { value: MealType.DINNER, label: 'Dîner' },
  { value: MealType.SNACK, label: 'Collation' },
] as const

const selected = computed(
  () => search.results.find((item) => item.id === selectedId.value) ?? null,
)

/** Aperçu des macros pour la portion saisie, calculé par l'entité elle-même. */
const preview = computed(() => {
  if (selected.value === null || !Number.isFinite(grams.value) || grams.value <= 0) return null
  const scaled = selected.value.macrosForGrams(grams.value)
  return scaled.ok ? scaled.value : null
})

/**
 * Repas déjà ouvert du même type : on le complète plutôt que d'en créer un second.
 *
 * « Ouvert » veut dire **pas encore pris** : un repas déclaré mangé est clos, et
 * le domaine refuse désormais qu'on y ajoute quoi que ce soit. Viser quand même
 * ce repas-là ferait échouer l'ajout sans recours ; on en ouvre un nouveau, ce
 * qui décrit d'ailleurs fidèlement ce qui s'est passé — on a remangé.
 */
const openMeal = computed(
  () =>
    journal.meals.find(
      (meal) => meal.type === mealType.value && meal.consumedAt === null,
    ) ?? null,
)

onMounted(async () => {
  const playerId = players.playerId
  if (playerId !== null) await journal.load(playerId, new Date())

  // Arrivée depuis la recherche : l'aliment est présélectionné.
  const requested = route.query.food
  if (typeof requested === 'string') selectedId.value = requested as FoodItemId
})

watch(
  () => search.results,
  (results) => {
    if (selectedId.value !== null && !results.some((item) => item.id === selectedId.value)) {
      selectedId.value = null
    }
  },
)

async function add(): Promise<void> {
  const playerId = players.playerId
  if (playerId === null || selected.value === null) return

  const added = await tracking.logFood({
    playerId,
    foodItemId: selected.value.id,
    grams: grams.value,
    mealType: mealType.value,
    ...(openMeal.value === null ? {} : { mealId: openMeal.value.mealId }),
  })

  if (added) {
    feedback.value = `${selected.value.name} ajouté (${grams.value} g).`
    selectedId.value = null
  }
}
</script>

<template>
  <div class="builder">
    <h1>Composer un repas</h1>

    <ErrorNotice :error="journal.error" />
    <ErrorNotice :error="search.error" />

    <BaseCard title="Type de repas">
      <fieldset class="builder__fieldset">
        <legend class="sr-only">
          Type de repas
        </legend>
        <div class="builder__choices">
          <label
            v-for="option in MEAL_OPTIONS"
            :key="option.value"
            class="choice"
          >
            <input
              v-model="mealType"
              type="radio"
              name="mealType"
              :value="option.value"
            >
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>
      <p
        v-if="openMeal"
        class="builder__note"
      >
        Un repas de ce type existe déjà aujourd’hui : l’aliment y sera ajouté.
      </p>
    </BaseCard>

    <BaseCard
      title="Choisir un aliment"
      subtitle="Un nom pour le catalogue Ciqual, un code-barres pour un produit de marque."
    >
      <form
        class="builder__search"
        role="search"
        @submit.prevent="search.find(query)"
      >
        <BaseField
          v-model="query"
          label="Rechercher"
          hint="Nom d’aliment, ou code-barres de 8 à 14 chiffres."
          placeholder="poulet ou 3017620422003"
        />
        <BaseButton
          type="submit"
          variant="secondary"
          :loading="search.status === 'loading'"
        >
          Chercher
        </BaseButton>
      </form>

      <p
        v-if="search.onlineSearchUnavailable"
        class="builder__offline"
      >
        <span aria-hidden="true">⌁</span>
        Open Food Facts n’a pas pu être interrogé. Seul le catalogue local a été consulté —
        la liste peut être incomplète.
      </p>

      <EmptyState
        v-if="!search.hasResults && search.status === 'ready'"
        title="Aucun aliment trouvé"
        :description="search.unknownBarcode
          ? 'Ce code-barres est inconnu du catalogue local comme d’Open Food Facts.'
          : 'Créez une fiche personnalisée si l’aliment n’existe pas encore.'"
      >
        <BaseButton
          size="sm"
          variant="secondary"
          @click="$router.push({ name: ROUTE.customFood })"
        >
          Créer un aliment
        </BaseButton>
      </EmptyState>

      <fieldset
        v-else-if="search.hasResults"
        class="builder__fieldset"
      >
        <legend class="sr-only">
          Résultats de la recherche
        </legend>
        <ul class="builder__results">
          <li
            v-for="item in search.results"
            :key="item.id"
          >
            <label class="choice choice--wide">
              <input
                v-model="selectedId"
                type="radio"
                name="food"
                :value="item.id"
              >
              <span class="builder__result">
                <strong>{{ item.name }}</strong>
                <small class="builder__result-meta">
                  <FoodSourceTag :source="item.source" />
                  {{ Math.round(item.macrosPer100g.calories()) }} kcal / 100 g
                </small>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>
    </BaseCard>

    <BaseCard
      v-if="selected"
      title="Portion"
    >
      <BaseField
        v-model="grams"
        label="Quantité"
        type="number"
        suffix="g"
        :min="1"
        :step="10"
      />

      <dl
        v-if="preview"
        class="builder__preview"
      >
        <div>
          <dt>Calories</dt>
          <dd>{{ Math.round(preview.calories()) }} kcal</dd>
        </div>
        <div>
          <dt>Protéines</dt>
          <dd>{{ preview.proteinG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Glucides</dt>
          <dd>{{ preview.carbsG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Lipides</dt>
          <dd>{{ preview.fatG.toFixed(1) }} g</dd>
        </div>
      </dl>

      <BaseButton
        block
        :disabled="preview === null"
        :loading="journal.status === 'loading'"
        @click="add"
      >
        Ajouter au repas
      </BaseButton>
    </BaseCard>

    <p
      class="builder__feedback"
      role="status"
      aria-live="polite"
    >
      {{ feedback }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.builder {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.builder__fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.builder__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.builder__note {
  margin: var(--space-3) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.builder__search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

/* Même traitement que sur l'écran de recherche : l'indisponibilité du réseau
   s'affiche, elle ne se déguise pas en « aucun résultat ». */
.builder__offline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.builder__result-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.builder__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 20rem;
  overflow-y: auto;
}

.builder__preview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.builder__preview div {
  display: flex;
  flex-direction: column;
}

.builder__preview dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.builder__preview dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.builder__feedback {
  margin: 0;
  min-height: 1.5rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-align: center;
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

.choice--wide {
  width: 100%;
  border-radius: var(--radius-md);
}

.choice span {
  display: flex;
  flex-direction: column;
}

.choice small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.choice input {
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
</style>
