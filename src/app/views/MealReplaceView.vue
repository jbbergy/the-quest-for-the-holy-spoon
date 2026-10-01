<script setup lang="ts">
/**
 * Remplacer un aliment du repas pour un membre du foyer, avant « Prévoir
 * aussi pour… » : le couscous de tout le foyer, avec des merguez végétales
 * pour la personne végétarienne.
 *
 * Deux temps : quel aliment changer, puis par quoi — avec la même recherche
 * que pour composer un repas. La quantité choisie est celle du membre ; elle
 * n'est pas ajustée à ses besoins. Rien n'est envoyé ici : le choix rejoint la
 * carte « Prévoir aussi pour… » de l'éditeur, qui l'enverra avec le repas.
 *
 * L'adresse garde l'aliment choisi (`?ligne=`), pour que le détour par la
 * création d'un aliment ramène au même endroit.
 */
import { computed, onMounted, ref } from 'vue'
import { type LocationQueryRaw, useRoute, useRouter } from 'vue-router'

import FoodPicker, { type FoodChoice } from '@/app/components/FoodPicker.vue'
import { usePageTitle } from '@/app/pageTitle'
import { usePlanForMembersStore } from '@/app/plan/usePlanForMembersStore'
import { formatPortion } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { useBackLink } from '@/app/useBackLink'
import { memberName, useHousehold } from '@/app/useHousehold'
import type { FoodItemId, MealEntryId, MealId, PlayerId } from '@/core/identity'
import { t } from '@/i18n'
import { useMealEditorStore } from '@/modules/nutrition_inventory/presentation/useMealEditorStore'
import AppIcon from '@/ui/AppIcon.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const route = useRoute()
const router = useRouter()
const editor = useMealEditorStore()
const household = useHousehold()
const draft = usePlanForMembersStore()

const mealId = computed(() => route.params.mealId as MealId)
const playerId = computed(() => route.params.playerId as PlayerId)

const back = useBackLink({
  to: { name: ROUTE.mealEditor, params: { mealId: mealId.value } },
  label: t('shell.titles.meal'),
})

const name = computed(() => memberName(household.household, playerId.value))
/** Le foyer est lu et ne compte plus ce membre : rien à remplacer pour lui. */
const gone = computed(() => household.loaded && name.value === null)

const title = computed(() =>
  name.value === null ? t('shell.titles.mealReplace') : t('week.plan.replaceTitle', { name: name.value }),
)
usePageTitle(title)

const entries = computed(() => (editor.meal?.mealId === mealId.value ? editor.meal.entries : []))
const lineId = computed(() => (typeof route.query.ligne === 'string' ? (route.query.ligne as MealEntryId) : null))
const line = computed(() => entries.value.find((entry) => entry.entryId === lineId.value) ?? null)

/** Retour de la création d'un aliment : il est présélectionné. */
const preselect = ref<FoodItemId | null>(
  typeof route.query.aliment === 'string' ? (route.query.aliment as FoodItemId) : null,
)

onMounted(async () => {
  draft.forMeal(mealId.value)
  if (editor.meal?.mealId !== mealId.value) await editor.open(mealId.value)
})

async function chooseLine(entryId: MealEntryId): Promise<void> {
  const query: LocationQueryRaw = { ...route.query, ligne: entryId }
  delete query.aliment
  preselect.value = null
  await router.replace({ query })
}

const confirmLabel = (food: string): string => t('week.plan.replaceChoose', { food })

/** Garde le remplacement pour l'envoi, puis ramène à l'éditeur. */
async function choose(choice: FoodChoice): Promise<boolean> {
  const replaced = line.value
  if (replaced === null) return false
  draft.replace(playerId.value, {
    entryId: replaced.entryId,
    replacedName: replaced.foodName,
    foodItemId: choice.food.id,
    foodName: choice.food.name,
    grams: choice.grams,
    measure: choice.measure,
  })
  await router.push(back.value.to)
  return true
}
</script>

<template>
  <div class="replace">
    <header class="replace__header">
      <RouterLink
        class="replace__back"
        :to="back.to"
      >
        <AppIcon name="chevron-left" />
        <span class="sr-only">{{ t('meal.editor.backTo', { label: back.label }) }}</span>
      </RouterLink>
      <!-- Le nom du membre, sur sa propre ligne et plus petit : « Remplacer un
           aliment pour Dominique-Alexandrine » en grand occupait tout le
           premier écran d'un téléphone. Le titre lu reste la phrase entière. -->
      <h1 class="replace__title">
        {{ t('shell.titles.mealReplace') }}
        <span
          v-if="name"
          class="replace__for"
        >{{ t('week.plan.replaceFor', { name }).trim() }}</span>
      </h1>
    </header>

    <ErrorNotice :error="editor.error" />

    <p
      v-if="gone"
      class="replace__note"
    >
      {{ t('week.plan.memberGone') }}
    </p>

    <template v-else>
      <fieldset class="replace__lines">
        <legend class="replace__legend">
          {{ t('week.plan.replaceWhich') }}
        </legend>
        <label
          v-for="entry in entries"
          :key="entry.entryId"
          class="replace__line"
        >
          <input
            type="radio"
            name="ligne"
            :value="entry.entryId"
            :checked="entry.entryId === lineId"
            @change="chooseLine(entry.entryId)"
          >
          <span class="replace__line-text">
            <span class="replace__line-name">{{ entry.foodName }}</span>
            <span class="replace__line-portion">{{ formatPortion(entry.amount, entry.measure) }}</span>
          </span>
        </label>
      </fieldset>

      <section
        v-if="line && name"
        class="replace__by"
        aria-labelledby="par-quoi"
      >
        <h2 id="par-quoi">
          {{ t('week.plan.replaceBy', { food: line.foodName }) }}
        </h2>
        <p class="replace__note">
          {{ t('week.plan.replaceHint', { name }) }}
        </p>
        <FoodPicker
          :add="choose"
          :preselect="preselect"
          :confirm-label="confirmLabel"
        />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.replace {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);

  h2 {
    margin: 0;
  }
}

.replace__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.replace__back {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-left: calc(-1 * var(--space-2));
  border-radius: 50%;
  color: var(--color-text);

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }
}

/* `min-width: 0` : sans lui, un mot long élargirait le titre au-delà de l'écran. */
.replace__title {
  min-width: 0;
  margin: 0;
  overflow-wrap: break-word;
}

.replace__for {
  display: block;
  margin-top: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  font-weight: 700;
  letter-spacing: 0;
}

.replace__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.replace__lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

/* La légende tient lieu de titre de section : elle en prend l'allure. */
.replace__legend {
  margin-bottom: var(--space-3);
  padding: 0;
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  line-height: var(--line-height-tight);
  letter-spacing: -0.01em;
}

/* Une ligne par aliment : un vrai bouton radio, toute la carte cliquable. */
.replace__line {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  cursor: pointer;

  input {
    width: 1.15rem;
    height: 1.15rem;
    flex-shrink: 0;
    accent-color: var(--color-accent);
  }

  /* L'aliment choisi : bordure épaisse **et** nom en gras, pas seulement la couleur. */
  &:has(input:checked) {
    padding-inline: calc(var(--space-4) - 1px);
    border: 2px solid var(--color-accent);
    background: var(--color-accent-soft);

    .replace__line-name {
      font-weight: 700;
    }
  }
}

.replace__line-text {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 var(--space-3);
  min-width: 0;
}

.replace__line-name {
  min-width: 0;
  overflow-wrap: break-word;
}

.replace__line-portion {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.replace__by {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
