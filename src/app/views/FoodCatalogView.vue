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
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { per100Label } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { foodAuthor, useHousehold } from '@/app/useHousehold'
import { useFoodCatalogStore } from '@/modules/nutrition_inventory/presentation/useFoodCatalogStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
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
    <RouterLink
      class="catalog__back"
      :to="{ name: ROUTE.settings }"
    >
      <span aria-hidden="true">←</span> Réglages
    </RouterLink>

    <div class="catalog__header">
      <h1>Mes aliments</h1>
      <BaseButton
        size="sm"
        @click="router.push({ name: ROUTE.customFood })"
      >
        <span aria-hidden="true">+</span> Créer un aliment
      </BaseButton>
    </div>

    <ErrorNotice :error="catalog.error" />

    <form
      class="catalog__search"
      role="search"
      @submit.prevent="refresh"
    >
      <BaseField
        v-model="query"
        label="Chercher dans mes aliments"
        hint="Par exemple : tarte de mamie."
      />
    </form>

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ catalog.status === 'ready' ? `${catalog.items.length} aliment${catalog.items.length > 1 ? 's' : ''} trouvé${catalog.items.length > 1 ? 's' : ''}.` : '' }}
    </p>

    <ul
      v-if="catalog.items.length > 0"
      class="catalog__list"
    >
      <li
        v-for="item in catalog.items"
        :key="item.id"
      >
        <RouterLink
          class="catalog__item"
          :to="{ name: ROUTE.foodDetail, params: { foodId: item.id } }"
        >
          <span class="catalog__name">{{ item.name }}</span>
          <span class="catalog__meta">
            <FoodSourceTag
              :source="item.source"
              :author="foodAuthor(household.household, players.playerId, item.ownerId)"
            />
            {{ Math.round(item.macrosPer100g.calories()) }} kcal pour {{ per100Label(item) }}
            <template v-if="item.servings.length > 0">
              · {{ item.servings.length }} portion{{ item.servings.length > 1 ? 's' : '' }}
            </template>
          </span>
        </RouterLink>
      </li>
    </ul>

    <EmptyState
      v-else-if="catalog.status === 'ready'"
      :title="query.trim() === '' ? 'Vous n’avez pas encore créé d’aliment.' : 'Aucun aliment ne porte ce nom.'"
      description="Créez ici vos recettes, ou un produit que vous ne trouvez pas dans la recherche."
    >
      <BaseButton
        size="sm"
        variant="secondary"
        @click="router.push({ name: ROUTE.customFood })"
      >
        Créer un aliment
      </BaseButton>
    </EmptyState>
  </div>
</template>

<style scoped lang="scss">
.catalog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.catalog__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);

  h1 {
    margin: 0;
  }
}

.catalog__back {
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

.catalog__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.catalog__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 44px;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  text-decoration: none;

  &:hover,
  &:focus-visible {
    border-color: var(--color-accent);
  }
}

.catalog__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.catalog__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
</style>
