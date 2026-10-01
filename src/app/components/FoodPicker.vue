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
import { computed, nextTick, ref, useId, watch } from 'vue'
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
import { lower, t } from '@/i18n'
import {
  DietSuitability,
  type RecentPortion,
  type RecipeSummary,
  recipesMatching,
} from '@/modules/nutrition_inventory/application'
import { type FoodItem, FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import type { Measure } from '@/modules/nutrition_inventory/domain/Measure'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FilterChips from '@/ui/FilterChips.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'
import InfoTip from '@/ui/InfoTip.vue'
import RichText from '@/ui/RichText.vue'

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

/**
 * Filtre par provenance. Les pastilles n'apparaissent que si les résultats en
 * mêlent au moins deux : un filtre qui ne trie rien n'est qu'un bruit de plus.
 */
type Filter = 'all' | 'catalogue' | 'brands' | 'created' | 'recipes'
const KIND: Readonly<Record<string, Filter>> = {
  [FoodSource.CIQUAL]: 'catalogue',
  [FoodSource.OPEN_FOOD_FACTS]: 'brands',
  [FoodSource.USER]: 'created',
}
const FILTER_LABEL: Readonly<Record<Filter, string>> = {
  all: 'meal.picker.filterAll',
  catalogue: 'meal.picker.filterCatalogue',
  brands: 'meal.picker.filterBrands',
  created: 'meal.picker.filterCreated',
  recipes: 'meal.picker.filterRecipes',
}
const filter = ref<Filter>('all')

const filterOptions = computed(() => {
  const kinds = new Set(shownResults.value.map((item) => KIND[item.source]))
  if (matchingRecipes.value.length > 0) kinds.add('recipes')
  const order: readonly Filter[] = ['catalogue', 'brands', 'created', 'recipes']
  const present = order.filter((kind) => kinds.has(kind))
  return present.length < 2
    ? []
    : (['all', ...present] as const).map((value) => ({ value, label: t(FILTER_LABEL[value]) }))
})

const filteredFoods = computed(() =>
  filter.value === 'all'
    ? shownResults.value
    : shownResults.value.filter((item) => KIND[item.source] === filter.value),
)
const shownRecipes = computed(() =>
  filter.value === 'all' || filter.value === 'recipes' ? matchingRecipes.value : [],
)

/** Une recherche courte peut trouver des dizaines d'aliments : on les montre par paquets. */
const PAGE = 8
const limit = ref(PAGE)
const visibleFoods = computed(() => filteredFoods.value.slice(0, limit.value))
const remaining = computed(() => filteredFoods.value.length - visibleFoods.value.length)

watch(filterOptions, (options) => {
  if (!options.some((option) => option.value === filter.value)) filter.value = 'all'
})
watch(filter, () => {
  limit.value = PAGE
  selectedId.value = null
})

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

/** L'aliment présélectionné — celui qu'on vient de créer — doit être visible. */
watch([selectedId, filteredFoods], ([id, foods]) => {
  const index = foods.findIndex((item) => item.id === id)
  if (index >= limit.value) limit.value = index + 1
})

/** Chaque résultat s'ouvre sur sa portion ; son bouton et son panneau se répondent. */
const baseId = useId()
const toggleId = (id: FoodItemId) => `${baseId}-${id}`
const panelId = (id: FoodItemId) => `${baseId}-${id}-portion`

/** Ouvre la portion d'un aliment, ou la referme s'il était déjà choisi. */
function toggle(id: FoodItemId): void {
  selectedId.value = selectedId.value === id ? null : id
}

/** Le panneau disparaît : le focus revient au résultat, pas en haut de la page. */
async function collapse(id: FoodItemId): Promise<void> {
  selectedId.value = null
  await nextTick()
  document.getElementById(toggleId(id))?.focus()
}

/** Pourquoi un aliment est masqué : « Ne convient pas : végétarien ». */
function conflictNote(item: FoodItem): string | null {
  const conflicts = DietSuitability.conflicts(item, diets.value)
  return conflicts.length === 0
    ? null
    : t('meal.picker.conflict', { diets: conflicts.map((diet) => lower(dietLabel(diet))).join(', ') })
}

/**
 * Sans réponse d'Open Food Facts, « aucun aliment trouvé » serait faux : seul
 * le catalogue public a été consulté. Le bandeau au-dessus dit pourquoi ; ce
 * titre ne doit pas le contredire.
 */
const emptyTitle = computed(() => {
  if (search.excluded.length > 0) return t('meal.picker.emptyDiet')
  return search.onlineSearchUnavailable
    ? t('meal.picker.emptyPublic')
    : t('meal.picker.empty')
})

const emptyDescription = computed(() => {
  if (search.unknownBarcode) return t('meal.picker.unknownBarcode')
  return search.onlineSearchUnavailable
    ? t('meal.picker.brandsFailed')
    : t('meal.picker.createHint')
})

function runSearch(text: string): void {
  showExcluded.value = false
  filter.value = 'all'
  limit.value = PAGE
  void search.find(text, diets.value)
}

async function confirm(): Promise<void> {
  const food = selected.value
  const chosen = portion.value
  if (food === null || chosen === null) return
  if (await props.add({ food, grams: chosen.grams, measure: chosen.measure })) await collapse(food.id)
}

/** Vide la recherche : le terme, les résultats et la sélection. */
function clear(): void {
  query.value = ''
  selectedId.value = null
  showExcluded.value = false
  filter.value = 'all'
  limit.value = PAGE
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
      <RichText path="meal.picker.note">
        <template #barcode>
          {{ t('meal.picker.barcode') }}<InfoTip
            :term="t('labels.term.barcode')"
            :text="GLOSSARY.barcode"
          />
        </template>
        <template #catalogue>
          {{ t('meal.picker.catalogue') }}<InfoTip
            :term="t('labels.term.publicCatalogue')"
            :text="GLOSSARY.ciqual"
          />
        </template>
        <template #brands>
          {{ t('meal.picker.brands') }}<InfoTip
            :term="t('labels.term.brandProducts')"
            :text="GLOSSARY.openFoodFacts"
          />
        </template>
      </RichText>
    </p>

    <!-- La recherche part à la validation, pas à chaque lettre : elle
         interroge aussi un service en ligne, qu'on ne sollicite pas pour
         « p », « po », « pou ». -->
    <form
      class="picker__search"
      role="search"
      @submit.prevent="runSearch(query)"
    >
      <BaseField
        v-model="query"
        type="search"
        enterkeyhint="search"
        :label="t('meal.picker.searchLabel')"
        :hint="t('meal.picker.searchHint')"
      >
        <template #leading>
          <AppIcon
            name="search"
            class="picker__search-icon"
          />
        </template>
      </BaseField>
      <BaseButton
        type="submit"
        variant="secondary"
        :loading="search.status === 'loading'"
      >
        {{ t('meal.picker.search') }}
      </BaseButton>
    </form>

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ search.status === 'ready' ? t('meal.picker.found', { n: shownResults.length }) : '' }}
    </p>

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
      <p>
        <template v-if="!showExcluded">
          {{ t('meal.picker.hidden', { n: search.excluded.length }) }}
        </template>
        <template v-else>
          {{ t('meal.picker.hiddenAtEnd') }}
        </template>
      </p>
      <BaseButton
        size="sm"
        variant="secondary"
        :aria-pressed="showExcluded ? 'true' : 'false'"
        @click="showExcluded = !showExcluded"
      >
        {{ showExcluded ? t('meal.picker.hide') : t('meal.picker.show') }}
      </BaseButton>
    </div>

    <FilterChips
      v-if="filterOptions.length > 0"
      v-model="filter"
      class="picker__filters"
      :legend="t('meal.picker.filterLegend')"
      :options="filterOptions"
    />

    <RecipeResults
      v-if="shownRecipes.length > 0 && addRecipe && removeRecipe"
      :recipes="shownRecipes"
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
        {{ t('meal.picker.create') }}
      </BaseButton>
    </EmptyState>

    <section
      v-else-if="visibleFoods.length > 0"
      class="picker__found"
      :aria-label="t('meal.picker.results')"
    >
      <ul class="picker__results">
        <li
          v-for="item in visibleFoods"
          :key="item.id"
          class="picker__item"
          :class="{ 'picker__item--open': selectedId === item.id }"
        >
          <!-- Toute la carte ouvre la portion : une cible large, et le nom
               de l'aliment comme nom du bouton. -->
          <button
            :id="toggleId(item.id)"
            type="button"
            class="picker__toggle"
            :data-food="item.id"
            :aria-expanded="selectedId === item.id ? 'true' : 'false'"
            :aria-controls="selectedId === item.id ? panelId(item.id) : undefined"
            @click="toggle(item.id)"
          >
            <span class="picker__result">
              <span class="picker__name">{{ item.name }}</span>
              <span class="picker__meta">
                <FoodSourceTag
                  :source="item.source"
                  :author="foodAuthor(household.household, players.playerId, item.ownerId)"
                />
                <span class="picker__kcal">{{ t('meal.picker.kcalPer', { kcal: Math.round(item.macrosPer100g.calories()), per: per100Label(item) }) }}</span>
              </span>
              <span
                v-if="conflictNote(item)"
                class="picker__conflict"
              >
                <AppIcon
                  name="alert"
                  class="picker__conflict-icon"
                />{{ conflictNote(item) }}
              </span>
            </span>
            <span
              class="picker__plus"
              aria-hidden="true"
            >
              <AppIcon name="plus" />
            </span>
          </button>

          <div
            v-if="selected && selected.id === item.id"
            :id="panelId(item.id)"
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
                <dt>{{ t('labels.nutrient.calories') }}</dt>
                <dd>{{ Math.round(macros.calories()) }} kcal</dd>
              </div>
              <div>
                <dt>{{ t('labels.nutrient.protein') }}</dt>
                <dd>{{ macros.proteinG.toFixed(1) }} g</dd>
              </div>
              <div>
                <dt>{{ t('labels.nutrient.carbs') }}</dt>
                <dd>{{ macros.carbsG.toFixed(1) }} g</dd>
              </div>
              <div>
                <dt>{{ t('labels.nutrient.fat') }}</dt>
                <dd>{{ macros.fatG.toFixed(1) }} g</dd>
              </div>
            </dl>

            <BaseButton
              block
              :disabled="portion === null || (preview && macros === null)"
              :loading="busy"
              @click="confirm"
            >
              {{ t('meal.picker.add', { food: selected.name }) }}
            </BaseButton>

            <BaseButton
              v-if="$slots.after"
              variant="ghost"
              size="sm"
              @click="collapse(item.id)"
            >
              {{ t('meal.picker.none') }}
            </BaseButton>
          </div>
        </li>
      </ul>

      <BaseButton
        v-if="remaining > 0"
        variant="secondary"
        size="sm"
        class="picker__more"
        @click="limit += PAGE"
      >
        {{ t('meal.picker.more', { n: Math.min(PAGE, remaining) }) }}
      </BaseButton>
    </section>

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
  </div>
</template>

<style scoped lang="scss">
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.picker__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.picker__search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.picker__search-icon {
  color: var(--color-text-muted);
}

.picker__excluded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);

  p {
    margin: 0;
  }
}

.picker__found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

/* Les résultats : une carte chacun, le bouton rond « + » à droite. */
.picker__results {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.picker__item {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

/* L'aliment ouvert : bordure Feuille épaisse, et le « + » devenu « × ». */
.picker__item--open {
  border: 2px solid var(--color-accent);
}

.picker__toggle {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 4rem;
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover .picker__plus {
    background: var(--color-accent-strong);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.picker__item--open .picker__toggle {
  padding: calc(var(--space-3) - 1px) calc(var(--space-3) - 1px) calc(var(--space-3) - 1px)
    calc(var(--space-4) - 1px);
}

.picker__result {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.picker__name {
  font-weight: 700;
  overflow-wrap: break-word;
}

.picker__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
}

.picker__kcal {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.picker__conflict {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.picker__conflict-icon {
  flex-shrink: 0;
  margin-top: 0.1em;
}

.picker__plus {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  transition: transform var(--duration-fast) var(--ease-out);
}

.picker__item--open .picker__plus {
  transform: rotate(45deg);
}

@media (prefers-reduced-motion: reduce) {
  .picker__plus {
    transition: none;
  }
}

.picker__portion {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 calc(var(--space-4) - 1px) calc(var(--space-4) - 1px);
}

.picker__macros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);

  div {
    display: flex;
    flex-direction: column;
  }

  dt {
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
  }

  dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

@media (forced-colors: active) {
  .picker__plus {
    border: 2px solid ButtonText;
  }
}
</style>
