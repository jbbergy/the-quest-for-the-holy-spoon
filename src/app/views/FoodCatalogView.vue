<script setup lang="ts">
/**
 * Mes aliments : ceux que j'ai saisis, et ceux du foyer.
 *
 * Seuls les aliments créés à la main y figurent. Ciqual et Open Food Facts
 * sont des références qu'on consulte en composant un repas ; il n'y a rien à
 * y gérer.
 *
 * La recherche part à la frappe : IndexedDB répond en quelques millisecondes,
 * rien ne justifie un bouton. Le terme est reporté dans l'adresse, et gardé
 * par le store, pour retrouver la même liste en revenant d'une fiche.
 *
 * C'est l'onglet « Mes aliments » du garde-manger. Avec un foyer, un filtre
 * sépare ses propres aliments de ceux des autres membres.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PantryHeader from '@/app/components/PantryHeader.vue'
import { per100Label } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { foodAuthor, useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import { useFoodCatalogStore } from '@/modules/nutrition_inventory/presentation/useFoodCatalogStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'

const route = useRoute()
const router = useRouter()
const catalog = useFoodCatalogStore()
const players = usePlayerStore()
const household = useHousehold()

/** Attente après la dernière frappe : assez pour ne pas chercher « p », « po », « pou »… */
const TYPING_DELAY_MS = 200

const query = ref('')

type Filter = 'all' | 'mine' | 'household'
const filter = ref<Filter>('all')
const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'foods.pantry.filterAll' },
  { value: 'mine', label: 'foods.pantry.filterMine' },
  { value: 'household', label: 'foods.pantry.filterHousehold' },
]

/** Sans foyer, tous les aliments sont les siens : le filtre n'aurait rien à trier. */
const canFilter = computed(() => household.household !== null)

function isMine(ownerId: string | null | undefined): boolean {
  return ownerId == null || ownerId === players.playerId
}

const shown = computed(() => {
  if (!canFilter.value || filter.value === 'all') return catalog.items
  const mine = filter.value === 'mine'
  return catalog.items.filter((item) => isMine(item.ownerId) === mine)
})

let typing: ReturnType<typeof setTimeout> | undefined

async function refresh(): Promise<void> {
  catalog.query = query.value
  const q = query.value.trim()
  await router.replace({ name: ROUTE.foods, query: q === '' ? {} : { q } })
  await catalog.browse()
}

watch(query, () => {
  clearTimeout(typing)
  typing = setTimeout(() => void refresh(), TYPING_DELAY_MS)
})

/**
 * L'adresse prime ; sans elle — retour depuis une fiche, lien des réglages —
 * on reprend la dernière recherche, que le store a gardée.
 */
onMounted(async () => {
  const q = route.query.q
  if (typeof q === 'string') catalog.query = q
  // Affecter `query` déclencherait la recherche différée : on lance la
  // première sans attendre, et on neutralise l'autre.
  query.value = catalog.query
  await refresh()
  clearTimeout(typing)
})
</script>

<template>
  <div class="catalog">
    <PantryHeader />

    <ErrorNotice :error="catalog.error" />

    <form
      class="catalog__search"
      role="search"
      @submit.prevent="refresh"
    >
      <BaseField
        v-model="query"
        type="search"
        :label="t('foods.catalog.searchLabel')"
        :hint="t('foods.catalog.searchHint')"
      >
        <template #leading>
          <AppIcon
            name="search"
            class="catalog__search-icon"
          />
        </template>
      </BaseField>

      <fieldset
        v-if="canFilter"
        class="catalog__filters"
      >
        <legend class="sr-only">
          {{ t('foods.pantry.filterLegend') }}
        </legend>
        <label
          v-for="option in FILTERS"
          :key="option.value"
          class="chip"
        >
          <input
            v-model="filter"
            class="chip__input"
            type="radio"
            name="food-filter"
            :value="option.value"
          >
          <span class="chip__label">{{ t(option.label) }}</span>
        </label>
      </fieldset>
    </form>

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ catalog.status === 'ready' ? t('foods.catalog.found', { n: shown.length }) : '' }}
    </p>

    <ul
      v-if="shown.length > 0"
      class="catalog__list"
      :aria-label="t('foods.pantry.foods')"
    >
      <li
        v-for="item in shown"
        :key="item.id"
      >
        <RouterLink
          class="catalog__item"
          :to="{ name: ROUTE.foodDetail, params: { foodId: item.id } }"
        >
          <span class="catalog__text">
            <span class="catalog__name">{{ item.name }}</span>
            <span class="catalog__meta">
              <FoodSourceTag
                :source="item.source"
                :author="foodAuthor(household.household, players.playerId, item.ownerId)"
              />
              {{ t('meal.picker.kcalPer', { kcal: Math.round(item.macrosPer100g.calories()), per: per100Label(item) }) }}
              <template v-if="item.servings.length > 0">
                · {{ t('foods.catalog.portions', { n: item.servings.length }) }}
              </template>
            </span>
          </span>
          <AppIcon
            name="chevron-right"
            class="catalog__chevron"
          />
        </RouterLink>
      </li>
    </ul>

    <EmptyState
      v-else-if="catalog.status === 'ready'"
      :title="query.trim() === '' ? t('foods.catalog.emptyNone') : t('foods.catalog.emptyNoMatch')"
      :description="t('foods.catalog.emptyDescription')"
    />

    <aside class="catalog__missing">
      <p class="catalog__missing-title">
        {{ t('foods.pantry.missingTitle') }}
      </p>
      <p>{{ t('foods.pantry.missingText') }}</p>
    </aside>

    <BaseButton
      block
      @click="router.push({ name: ROUTE.customFood })"
    >
      <AppIcon name="plus" />
      {{ t('foods.catalog.create') }}
    </BaseButton>
  </div>
</template>

<style scoped lang="scss">
.catalog {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.catalog__search {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.catalog__search-icon {
  color: var(--color-text-muted);
}

.catalog__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: none;
}

/* Puce de filtre : un vrai bouton radio, masqué, sous une étiquette cliquable.
   Le clavier et l'annonce (« Les miens, bouton radio, 2 sur 3 ») viennent de
   l'élément natif. */
.chip {
  position: relative;
  display: inline-flex;
}

.chip__input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.chip__label {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.chip__input:checked + .chip__label {
  background: var(--color-inverse);
  border-color: var(--color-inverse);
  color: var(--color-on-inverse);
  font-weight: 700;
}

.chip__input:focus-visible + .chip__label {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* Une seule carte, des lignes séparées par un filet. */
.catalog__list {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.catalog__list li + li {
  border-top: 1px solid var(--color-divider);
}

.catalog__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 4.25rem;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.catalog__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.catalog__name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.catalog__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.catalog__chevron {
  color: var(--color-text-muted);
}

.catalog__missing {
  padding: var(--space-4) var(--space-5);
  background: var(--color-saffron-soft);
  border-radius: var(--radius-lg);
  color: var(--color-on-saffron-soft);

  p {
    margin: 0;
  }
}

.catalog__missing-title {
  font-weight: 700;
}
</style>
