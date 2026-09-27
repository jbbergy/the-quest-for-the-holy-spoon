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
import { FoodSource } from '@/modules/nutrition_inventory/domain/FoodItem'
import { servingMeasure } from '@/modules/nutrition_inventory/domain/Measure'
import { useFoodCatalogStore } from '@/modules/nutrition_inventory/presentation/useFoodCatalogStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'

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
usePageTitle(() => food.value?.name ?? 'Aliment')

const per100 = computed(() => (food.value === null ? '100 g' : per100Label(food.value)))

/** Pourquoi la fiche ne se modifie pas : on le dit plutôt que de cacher le bouton sans un mot. */
const readOnlyReason = computed(() => {
  if (food.value === null || canEdit.value) return null
  if (food.value.source !== FoodSource.USER) {
    return 'Cet aliment vient d’un catalogue. Vous ne pouvez pas le modifier.'
  }
  return `${author.value ?? 'Un autre membre du foyer'} a créé cet aliment. Seule cette personne peut le modifier.`
})

onMounted(() => catalog.open(route.params.foodId as FoodItemId))

async function remove(): Promise<void> {
  if (food.value === null) return
  if (await catalog.remove(food.value.id, players.playerId)) {
    await router.push({ name: ROUTE.foods })
  }
}

const NUTRIENTS = [
  { key: 'fiberG', label: 'Fibres' },
  { key: 'sugarsG', label: 'Sucres' },
  { key: 'saturatedFatG', label: 'Graisses saturées' },
  { key: 'saltG', label: 'Sel' },
] as const
</script>

<template>
  <div class="food">
    <RouterLink
      class="food__back"
      :to="{ name: ROUTE.foods }"
    >
      <span aria-hidden="true">←</span> Mes aliments
    </RouterLink>

    <ErrorNotice :error="catalog.error" />

    <EmptyState
      v-if="food === null && catalog.status !== 'loading'"
      title="Cet aliment n’existe plus."
      description="Il a été supprimé, sur cet appareil ou par un autre membre du foyer."
    />

    <template v-else-if="food">
      <div class="food__title">
        <h1>{{ food.name }}</h1>
        <FoodSourceTag
          :source="food.source"
          :author="author"
        />
      </div>

      <BaseCard
        :title="`Pour ${per100}`"
        :subtitle="`${Math.round(food.macrosPer100g.calories())} kcal`"
      >
        <dl class="food__values">
          <div>
            <dt>Protéines</dt>
            <dd>{{ food.macrosPer100g.proteinG.toFixed(1) }} g</dd>
          </div>
          <div>
            <dt>Glucides</dt>
            <dd>{{ food.macrosPer100g.carbsG.toFixed(1) }} g</dd>
          </div>
          <div>
            <dt>Lipides</dt>
            <dd>{{ food.macrosPer100g.fatG.toFixed(1) }} g</dd>
          </div>
          <div
            v-for="nutrient in NUTRIENTS"
            :key="nutrient.key"
          >
            <dt>{{ nutrient.label }}</dt>
            <dd>{{ food.detailPer100g[nutrient.key].toFixed(nutrient.key === 'saltG' ? 2 : 1) }} g</dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard
        title="Portions"
        :subtitle="food.unit === 'ml' ? 'Liquide : se mesure en millilitres.' : 'Solide : se pèse en grammes.'"
      >
        <ul
          v-if="food.servings.length > 0"
          class="food__servings"
        >
          <li
            v-for="serving in food.servings"
            :key="serving.label"
          >
            <span>1 {{ serving.label }}</span>
            <span class="food__muted">{{ formatWeight(serving.grams, servingMeasure(serving), food.baseMeasure) }}</span>
          </li>
        </ul>
        <p
          v-else
          class="food__muted"
        >
          Pas de portion. La quantité se note en {{ food.unit === 'ml' ? 'millilitres' : 'grammes' }}.
        </p>
      </BaseCard>

      <BaseCard
        v-if="food.barcode || food.tags.length > 0"
        title="Autres informations"
      >
        <p
          v-if="food.barcode"
          class="food__line"
        >
          Code-barres : <span class="food__code">{{ food.barcode }}</span>
        </p>
        <ul
          v-if="food.tags.length > 0"
          class="food__tags"
        >
          <li
            v-for="tag in food.tags"
            :key="tag"
          >
            {{ tagLabel(tag) }}
          </li>
        </ul>
      </BaseCard>

      <p
        v-if="readOnlyReason"
        class="food__note"
      >
        {{ readOnlyReason }}
      </p>

      <div class="food__actions">
        <BaseButton
          @click="router.push({ name: ROUTE.mealEditor, query: { aliment: food.id, ...returnQuery } })"
        >
          Ajouter à un repas
        </BaseButton>
        <BaseButton
          v-if="canEdit"
          variant="secondary"
          @click="router.push({ name: ROUTE.foodEdit, params: { foodId: food.id } })"
        >
          Modifier
        </BaseButton>
        <ConfirmButton
          v-if="canEdit"
          :question="`Supprimer « ${food.name} » ? Les repas qui le contiennent ne changent pas.`"
          confirm-label="Supprimer"
          :loading="catalog.status === 'loading'"
          @confirm="remove"
        >
          Supprimer
        </ConfirmButton>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.food {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.food__back {
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

.food__title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);

  h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
}

.food__values {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: var(--space-3);
  margin: 0;

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
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.food__servings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }
}

.food__muted {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.food__line {
  margin: 0 0 var(--space-2);
}

.food__code {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.food__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    padding: var(--space-1) var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-sm);
  }
}

.food__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.food__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
</style>
