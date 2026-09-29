<script setup lang="ts">
/**
 * Chercher un aliment et choisir sa portion.
 *
 * La même recherche partout où l'on ajoute un aliment — un repas, la liste de
 * courses : catalogue public, produits de marque et aliments du foyer, par nom
 * ou par code-barres, selon le régime du profil. Ce qu'elle masque est compté,
 * et peut être affiché. Rien trouvé : on peut créer l'aliment.
 *
 * Le composant ne sait pas où va l'aliment : `add` le reçoit avec sa portion,
 * et répond s'il a été ajouté. La sélection s'efface alors, prête pour le
 * suivant.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import OnlineSearchNotice from '@/app/components/OnlineSearchNotice.vue'
import PortionPicker from '@/app/components/PortionPicker.vue'
import RecipeResults from '@/app/components/RecipeResults.vue'
import { GLOSSARY } from '@/app/glossary'
import { per100Label } from '@/app/portionFormat'
import { dietLabel, dietsOf } from '@/app/profileOptions'
import { ROUTE } from '@/app/router'
import { foodAuthor, useHousehold } from '@/app/useHousehold'
import type { FoodItemId } from '@/core/identity'
import {
  DietSuitability,
  type RecentPortion,
  type RecipeSummary,
  recipesMatching,
} from '@/modules/nutrition_inventory/application'
import type { FoodItem } from '@/modules/nutrition_inventory/domain/FoodItem'
import type { Measure } from '@/modules/nutrition_inventory/domain/Measure'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'
import InfoTip from '@/ui/InfoTip.vue'

export interface FoodChoice {
  readonly food: FoodItem
  readonly grams: number
  readonly measure: Measure
}

const props = withDefaults(
  defineProps<{
    /** Ajoute l'aliment choisi ; `true` s'il l'a été. */
    add: (choice: FoodChoice) => Promise<boolean>
    /** Dernières portions saisies, pour les proposer d'emblée. */
    recent?: ReadonlyMap<FoodItemId, RecentPortion>
    /** Montrer les calories et macros de la portion avant de l'ajouter. */
    preview?: boolean
    busy?: boolean
    /** Aliment à présélectionner — celui qu'on vient de créer. */
    preselect?: FoodItemId | null
    /**
     * Recettes du joueur, à retrouver par la recherche. Absentes, la recherche
     * ne cherche que des aliments — comme dans la liste de courses.
     */
    recipes?: readonly RecipeSummary[]
    addRecipe?: (recipe: RecipeSummary) => Promise<void>
    removeRecipe?: (recipe: RecipeSummary) => Promise<void>
  }>(),
  {
    recent: () => new Map(),
    preview: false,
    busy: false,
    preselect: null,
    recipes: () => [],
  },
)

const route = useRoute()
const router = useRouter()
const players = usePlayerStore()
const search = useFoodSearchStore()
const household = useHousehold()

const query = ref('')
/** Quantité choisie dans le sélecteur de portion, `null` tant qu'elle est invalide. */
const portion = ref<{ readonly grams: number; readonly measure: Measure } | null>(null)
const selectedId = ref<FoodItemId | null>(props.preselect)
/** Montrer aussi les aliments masqués par le régime : un marqueur peut se tromper. */
const showExcluded = ref(false)

const diets = computed(() => dietsOf(players.needs?.restrictions ?? []))

/** Les résultats affichés : ceux qui conviennent, puis, sur demande, les autres. */
const shownResults = computed<readonly FoodItem[]>(() =>
  showExcluded.value ? [...search.results, ...search.excluded] : search.results,
)

/** Les recettes qui répondent à la dernière recherche lancée. */
const matchingRecipes = computed(() =>
  props.addRecipe === undefined || props.removeRecipe === undefined || search.status !== 'ready'
    ? []
    : recipesMatching(props.recipes, search.query),
)

const selected = computed(
  () => shownResults.value.find((item) => item.id === selectedId.value) ?? null,
)

const recentForSelected = computed(() =>
  selected.value === null ? null : (props.recent.get(selected.value.id) ?? null),
)

/** Aperçu des macros pour la portion saisie, calculé par l'entité elle-même. */
const macros = computed(() => {
  if (!props.preview || selected.value === null || portion.value === null) return null
  const scaled = selected.value.macrosForGrams(portion.value.grams)
  return scaled.ok ? scaled.value : null
})

watch(shownResults, (results) => {
  if (selectedId.value !== null && !results.some((item) => item.id === selectedId.value)) {
    selectedId.value = null
  }
})

watch(
  () => props.preselect,
  (id) => {
    if (id !== null) selectedId.value = id
  },
)

/** Pourquoi un aliment est masqué : « Ne convient pas : végétarien ». */
function conflictNote(item: FoodItem): string | null {
  const conflicts = DietSuitability.conflicts(item, diets.value)
  return conflicts.length === 0
    ? null
    : `Ne convient pas : ${conflicts.map((diet) => dietLabel(diet).toLocaleLowerCase('fr-FR')).join(', ')}`
}

/**
 * Sans réponse d'Open Food Facts, « aucun aliment trouvé » serait faux : seul
 * le catalogue public a été consulté. Le bandeau au-dessus dit pourquoi ; ce
 * titre ne doit pas le contredire.
 */
const emptyTitle = computed(() => {
  if (search.excluded.length > 0) return 'Aucun aliment trouvé qui convienne à votre régime.'
  return search.onlineSearchUnavailable
    ? 'Aucun aliment trouvé dans le catalogue public.'
    : 'Aucun aliment trouvé.'
})

const emptyDescription = computed(() => {
  if (search.unknownBarcode) return 'Ce code-barres n’est dans aucun catalogue.'
  return search.onlineSearchUnavailable
    ? 'Les produits de marque n’ont pas pu être cherchés. Réessayez dans un moment, ou créez cet aliment vous-même.'
    : 'Vous pouvez créer cet aliment vous-même.'
})

function runSearch(text: string): void {
  showExcluded.value = false
  void search.find(text, diets.value)
}

async function confirm(): Promise<void> {
  const food = selected.value
  const chosen = portion.value
  if (food === null || chosen === null) return
  if (await props.add({ food, grams: chosen.grams, measure: chosen.measure })) selectedId.value = null
}

/** Vide la recherche : le terme, les résultats et la sélection. */
function clear(): void {
  query.value = ''
  selectedId.value = null
  showExcluded.value = false
  search.reset()
}

async function createFood(): Promise<void> {
  await router.push({ name: ROUTE.customFood, query: { retour: route.fullPath } })
}
</script>

<template>
  <div class="picker">
    <ErrorNotice :error="search.error" />

    <p class="picker__note">
      Tapez le nom d’un aliment, ou le numéro du code-barres<InfoTip
        term="code-barres"
        :text="GLOSSARY.barcode"
      />.
      L’application cherche dans le catalogue public des aliments<InfoTip
        term="catalogue public"
        :text="GLOSSARY.ciqual"
      />
      et dans les produits de marque<InfoTip
        term="produits de marque"
        :text="GLOSSARY.openFoodFacts"
      />.
    </p>
    <form
      class="picker__search"
      role="search"
      @submit.prevent="runSearch(query)"
    >
      <BaseField
        v-model="query"
        label="Nom ou code-barres"
        hint="Par exemple : poulet, ou 3017620422003."
      />
      <BaseButton
        type="submit"
        variant="secondary"
        :loading="search.status === 'loading'"
      >
        Chercher
      </BaseButton>
    </form>

    <OnlineSearchNotice
      v-if="search.onlineSearchUnavailable"
      class="picker__offline"
      :busy="search.status === 'loading'"
      @retry="runSearch(search.query)"
    />

    <div
      v-if="search.status === 'ready' && search.excluded.length > 0"
      class="picker__excluded"
    >
      <p role="status">
        <template v-if="!showExcluded">
          {{ search.excluded.length }} aliment{{ search.excluded.length > 1 ? 's' : '' }}
          masqué{{ search.excluded.length > 1 ? 's' : '' }} : ne
          convien{{ search.excluded.length > 1 ? 'nent' : 't' }} pas à votre régime.
        </template>
        <template v-else>
          Les aliments qui ne conviennent pas à votre régime sont à la fin de la liste.
        </template>
      </p>
      <BaseButton
        size="sm"
        variant="secondary"
        :aria-pressed="showExcluded ? 'true' : 'false'"
        @click="showExcluded = !showExcluded"
      >
        {{ showExcluded ? 'Les masquer' : 'Les afficher' }}
      </BaseButton>
    </div>

    <RecipeResults
      v-if="matchingRecipes.length > 0 && addRecipe && removeRecipe"
      :recipes="matchingRecipes"
      :busy="busy"
      :add="addRecipe"
      :remove="removeRecipe"
    />

    <EmptyState
      v-if="shownResults.length === 0 && matchingRecipes.length === 0 && search.status === 'ready'"
      :title="emptyTitle"
      :description="emptyDescription"
    >
      <BaseButton
        size="sm"
        variant="secondary"
        @click="createFood"
      >
        Créer un aliment
      </BaseButton>
    </EmptyState>

    <fieldset
      v-else-if="shownResults.length > 0"
      class="picker__fieldset"
    >
      <legend class="sr-only">
        Résultats de la recherche
      </legend>
      <ul class="picker__results">
        <li
          v-for="item in shownResults"
          :key="item.id"
        >
          <label class="picker__choice">
            <input
              v-model="selectedId"
              type="radio"
              name="food"
              :value="item.id"
            >
            <span class="picker__result">
              <strong>{{ item.name }}</strong>
              <small class="picker__result-meta">
                <FoodSourceTag
                  :source="item.source"
                  :author="foodAuthor(household.household, players.playerId, item.ownerId)"
                />
                {{ Math.round(item.macrosPer100g.calories()) }} kcal pour {{ per100Label(item) }}
              </small>
              <small
                v-if="conflictNote(item)"
                class="picker__conflict"
              >{{ conflictNote(item) }}</small>
            </span>
          </label>
        </li>
      </ul>
    </fieldset>

    <!-- Ce qu'un écran propose de plus après une recherche, trouvée ou non :
         la liste de courses y ajoute le terme cherché tel quel, puis vide la
         recherche avec `reset`. Masqué tant qu'un aliment est choisi : sa
         quantité se donne alors par la portion, et deux champs de quantité à
         l'écran laissaient croire que l'un comptait pour l'autre. -->
    <div
      v-if="$slots.after && !selected && search.status === 'ready' && search.query.trim() !== ''"
      class="picker__after"
    >
      <slot
        name="after"
        :query="search.query"
        :reset="clear"
      />
    </div>

    <div
      v-if="selected"
      class="picker__portion"
    >
      <PortionPicker
        :food="selected"
        :recent="recentForSelected"
        @change="(next) => (portion = next)"
      />

      <dl
        v-if="macros"
        class="picker__macros"
      >
        <div>
          <dt>Calories</dt>
          <dd>{{ Math.round(macros.calories()) }} kcal</dd>
        </div>
        <div>
          <dt>Protéines</dt>
          <dd>{{ macros.proteinG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Glucides</dt>
          <dd>{{ macros.carbsG.toFixed(1) }} g</dd>
        </div>
        <div>
          <dt>Lipides</dt>
          <dd>{{ macros.fatG.toFixed(1) }} g</dd>
        </div>
      </dl>

      <BaseButton
        block
        :disabled="portion === null || (preview && macros === null)"
        :loading="busy"
        @click="confirm"
      >
        Ajouter {{ selected.name }}
      </BaseButton>

      <BaseButton
        v-if="$slots.after"
        class="picker__none"
        variant="ghost"
        size="sm"
        @click="selectedId = null"
      >
        Aucun de ces aliments
      </BaseButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.picker__note {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.picker__search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.picker__excluded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.picker__excluded p {
  margin: 0;
}

.picker__after {
  margin-top: var(--space-3);
}

.picker__none {
  margin-top: var(--space-2);
}

.picker__conflict {
  display: block;
  color: var(--color-danger);
  font-weight: 600;
}

/* L'indisponibilité du réseau s'affiche, elle ne se déguise pas en « aucun
   résultat ». */
.picker__offline {
  margin: 0 0 var(--space-4);
}

.picker__fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.picker__results {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 20rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.picker__choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.picker__choice input {
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}

.picker__choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

.picker__result {
  display: flex;
  flex-direction: column;
}

.picker__result small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.picker__result-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.picker__portion {
  margin-top: var(--space-4);
}

.picker__macros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.picker__macros div {
  display: flex;
  flex-direction: column;
}

.picker__macros dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.picker__macros dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
