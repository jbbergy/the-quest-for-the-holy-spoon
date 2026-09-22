<script setup lang="ts">
/**
 * Recherche d'aliments, par nom ou par code-barres.
 *
 * Un seul champ : c'est `FindFoodUseCase` qui reconnaît un code-barres à sa
 * forme. Deux formulaires séparés obligeaient l'utilisateur à savoir d'avance
 * dans quelle base se trouve ce qu'il cherche — une question à laquelle il n'a
 * aucune raison de pouvoir répondre.
 *
 * L'indisponibilité de la recherche en ligne est affichée **explicitement**, et
 * non traduite en « aucun résultat » : c'est la différence entre « ce produit
 * n'existe pas » et « je ne peux pas aller voir ». Le Use Case distingue déjà
 * les deux cas ; l'UI se contente de le dire.
 */
import { computed, ref } from 'vue'

import { ROUTE } from '@/app/router'
import { useFoodSearchStore } from '@/modules/nutrition_inventory/presentation/useFoodSearchStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import FoodSourceTag from '@/ui/FoodSourceTag.vue'

const search = useFoodSearchStore()

const query = ref('')

const isBusy = computed(() => search.status === 'loading')
const hasSearched = computed(() => search.status === 'ready')

/**
 * Le résultat est annoncé par une région discrète : sans elle, un utilisateur de
 * lecteur d'écran validerait sa recherche et n'entendrait rien changer.
 */
const resultAnnouncement = computed(() => {
  if (!hasSearched.value) return ''
  if (search.onlineSearchUnavailable) {
    return `Recherche en ligne indisponible. ${search.results.length} résultat(s) dans le catalogue local.`
  }
  return `${search.results.length} résultat(s).`
})
</script>

<template>
  <div class="foods">
    <h1>Rechercher un aliment</h1>

    <ErrorNotice :error="search.error" />

    <BaseCard
      title="Nom ou code-barres"
      subtitle="Le catalogue local est consulté en premier, puis Open Food Facts pour un code-barres si vous êtes connecté."
    >
      <form
        class="foods__form"
        role="search"
        @submit.prevent="search.find(query)"
      >
        <BaseField
          v-model="query"
          label="Rechercher"
          hint="Par exemple « riz complet », ou un code-barres de 8 à 14 chiffres."
          placeholder="poulet ou 3017620422003"
        />
        <BaseButton
          type="submit"
          :loading="isBusy"
        >
          Chercher
        </BaseButton>
      </form>
    </BaseCard>

    <p
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ resultAnnouncement }}
    </p>

    <p
      v-if="search.onlineSearchUnavailable"
      class="foods__offline"
    >
      <span aria-hidden="true">⌁</span>
      Open Food Facts n’a pas pu être interrogé — résultats du catalogue local uniquement.
    </p>

    <BaseCard
      v-if="search.hasResults"
      title="Résultats"
    >
      <ul class="foods__list">
        <li
          v-for="item in search.results"
          :key="item.id"
          class="foods__item"
        >
          <div class="foods__item-main">
            <span class="foods__name">{{ item.name }}</span>
            <FoodSourceTag :source="item.source" />
          </div>
          <p class="foods__macros">
            Pour 100 g : {{ Math.round(item.macrosPer100g.calories()) }} kcal ·
            {{ item.macrosPer100g.proteinG.toFixed(1) }} g protéines ·
            {{ item.macrosPer100g.carbsG.toFixed(1) }} g glucides ·
            {{ item.macrosPer100g.fatG.toFixed(1) }} g lipides
          </p>
          <BaseButton
            size="sm"
            variant="secondary"
            @click="$router.push({ name: ROUTE.mealBuilder, query: { food: item.id } })"
          >
            Ajouter à un repas
          </BaseButton>
        </li>
      </ul>
    </BaseCard>

    <EmptyState
      v-else-if="hasSearched"
      title="Aucun aliment trouvé"
      :description="search.unknownBarcode
        ? 'Ce code-barres est inconnu du catalogue local comme d’Open Food Facts.'
        : 'Essayez un autre terme, ou créez une fiche personnalisée.'"
    >
      <BaseButton
        variant="secondary"
        @click="$router.push({ name: ROUTE.customFood })"
      >
        Créer un aliment
      </BaseButton>
    </EmptyState>
  </div>
</template>

<style scoped lang="scss">
.foods {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.foods__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.foods__offline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.foods__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.foods__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
}

.foods__item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}

.foods__name {
  font-weight: 600;
}


.foods__macros {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
</style>
