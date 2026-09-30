<script setup lang="ts">
/**
 * La liste de courses de la semaine.
 *
 * Avec un foyer, la liste est commune : chaque membre la remplit, y ajoute des
 * articles et coche ce qu'il met dans le panier : l'article reste dans la
 * liste, barré. Seule la croix le retire. Tout le monde voit les mêmes
 * cases. Sans foyer, la liste est personnelle.
 *
 * « Remplir la liste » reprend les aliments des repas pas encore mangés de la
 * semaine affichée : les siens, et ceux des membres qui partagent leurs
 * journées.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import FoodPicker, { type FoodChoice } from '@/app/components/FoodPicker.vue'
import { useContainer } from '@/app/container'
import { formatWeek } from '@/app/mealLabels'
import { formatPortion } from '@/app/portionFormat'
import { ROUTE } from '@/app/router'
import { readGroceryDemand, type SkippedMember } from '@/app/shopping/groceryDemand'
import { formatShoppingQuantity } from '@/app/shopping/shoppingFormat'
import { useSyncStatus } from '@/app/sync/useSyncStatus'
import { useBackLink } from '@/app/useBackLink'
import { useHousehold } from '@/app/useHousehold'
import { useTodayStore } from '@/app/day/useTodayStore'
import { addDays, type DayKey, parseDayKey, startOfWeek } from '@/core/day'
import { type ErrorView, toErrorView } from '@/core/errors'
import { type FoodItemId, type HouseholdId, idFrom, type ShoppingItemId } from '@/core/identity'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import type { ShoppingItemView } from '@/modules/shopping/application'
import { useShoppingListStore } from '@/modules/shopping/presentation/useShoppingListStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import EmptyState from '@/ui/EmptyState.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

/** Pendant que la liste est ouverte, on relit souvent : au magasin, on est parfois deux. */
const SHOPPING_SYNC_INTERVAL_MS = 20_000

const route = useRoute()
const router = useRouter()
const container = useContainer()
const players = usePlayerStore()
const account = useAccountStore()
const household = useHousehold()
const shopping = useShoppingListStore()
const clock = useTodayStore()
const back = useBackLink({ to: { name: ROUTE.weekPlan }, label: t('week.title') })

/** Lundi de la semaine, `?semaine=` ; la semaine en cours par défaut. */
const week = computed<DayKey>(() => {
  const asked = parseDayKey(String(route.query.semaine ?? ''))
  return startOfWeek(asked ?? clock.today)
})
const range = computed(() => formatWeek(week.value, addDays(week.value, 6)))

/**
 * Foyer de la liste. Hors ligne, le foyer ne peut pas être demandé au
 * serveur : on reprend celui de la dernière synchronisation, pour que la liste
 * commune reste lisible au magasin.
 */
const householdId = ref<HouseholdId | null>(null)
const resolved = ref(false)

async function resolveHousehold(): Promise<HouseholdId | null> {
  if (account.session === null) return null
  if (household.loaded) return household.household?.id ?? null
  const known = await container.sync.knownHouseholdId()
  return known === null ? null : idFrom<'HouseholdId'>(known)
}

async function open(): Promise<void> {
  const playerId = players.playerId
  if (playerId === null) return
  householdId.value = await resolveHousehold()
  resolved.value = true
  await shopping.load({ householdId: householdId.value, playerId, week: week.value })
  await fillIfAsked()
}

/**
 * `?remplir=1` : venu du bouton « Remplir la liste » de la semaine. La liste
 * se remplit une fois ouverte, ici, où le résultat s'affiche ; le paramètre
 * est retiré aussitôt, pour qu'un rechargement ne la remplisse pas de nouveau.
 */
let fillAsked = route.query.remplir === '1'

async function fillIfAsked(): Promise<void> {
  // La liste s'ouvre parfois deux fois de suite (le foyer arrive après) : le
  // drapeau tombe avant toute attente, pour qu'un seul passage remplisse.
  if (!fillAsked) return
  fillAsked = false
  const query = { ...route.query }
  delete query.remplir
  await router.replace({ query })
  await fill()
}

watch(
  [
    week,
    () => players.playerId,
    () => account.session?.accountId,
    () => (household.loaded ? (household.household?.id ?? null) : undefined),
  ],
  open,
  { immediate: true },
)

// Ce que les autres membres cochent ou ajoutent apparaît sans rien faire.
const { remoteRevision } = useSyncStatus()
watch(remoteRevision, () => shopping.load())

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void container.sync.sync()
  }, SHOPPING_SYNC_INTERVAL_MS)
})
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer)
})

const scopeText = computed(() => {
  if (householdId.value === null) return t('shopping.scopePersonal')
  const name = household.household?.name
  return name === undefined
    ? t('shopping.scopeHousehold')
    : t('shopping.scopeHouseholdNamed', { name })
})

// --- Remplir ---------------------------------------------------------------

const filling = ref(false)
const fillMessage = ref('')
const skipped = ref<readonly SkippedMember[]>([])
const fillError = ref<ErrorView | null>(null)

async function fill(): Promise<void> {
  const playerId = players.playerId
  if (playerId === null) return
  filling.value = true
  fillMessage.value = ''
  fillError.value = null
  skipped.value = []

  const members = householdId.value === null ? null : household.household
  const report = await readGroceryDemand(container, playerId, week.value, members)
  if (!report.ok) {
    filling.value = false
    fillError.value = toErrorView(report.error)
    return
  }
  const outcome = await shopping.fill(report.value.demand)
  filling.value = false
  if (outcome === null) return

  skipped.value = report.value.skipped
  const changes = [
    outcome.added > 0 ? t('shopping.added', { n: outcome.added }) : null,
    outcome.updated > 0 ? t('shopping.updated', { n: outcome.updated }) : null,
  ].filter((part): part is string => part !== null)
  fillMessage.value =
    changes.length === 0
      ? t('shopping.upToDate')
      : t('shopping.updatedList', { changes: changes.join(', ') })
}

/** Le foyer n'a pas pu être lu (hors ligne) : seuls ses propres repas comptent. */
const ownMealsOnly = computed(() => householdId.value !== null && household.household === null)

function skippedText(member: SkippedMember): string {
  return member.reason === 'not-shared'
    ? t('shopping.skippedNotShared', { name: member.name })
    : t('shopping.skippedOffline', { name: member.name })
}

// --- Articles ----------------------------------------------------------------

/** Aliment à présélectionner : celui qu'on vient de créer (`?aliment=`). */
const preselect = computed<FoodItemId | null>(() =>
  typeof route.query.aliment === 'string' ? idFrom<'FoodItemId'>(route.query.aliment) : null,
)
const added = ref('')

/** Un aliment trouvé par la recherche, avec sa portion. */
async function addFood(choice: FoodChoice): Promise<boolean> {
  added.value = ''
  const done = await shopping.addFood({
    foodItemId: choice.food.id,
    name: choice.food.name,
    grams: choice.grams,
    unit: choice.measure,
  })
  if (done) {
    added.value = t('meal.editor.foodAdded', {
      food: choice.food.name,
      portion: formatPortion(choice.grams / choice.measure.grams, choice.measure),
    })
  }
  return done
}

/** Quantité libre d'un article ajouté tel quel : « 1 paquet », « x3 ». */
const quantityText = ref('')
const addingName = ref(false)

/**
 * Ce que la recherche ne connaît pas — « lessive », « piles » : ajouté par
 * son nom, avec la quantité écrite s'il y en a une. La recherche est ensuite
 * vidée : le bouton disparaît, on ne l'ajoute pas deux fois par mégarde.
 */
async function addName(name: string, reset: () => void): Promise<void> {
  if (addingName.value) return
  added.value = ''
  addingName.value = true
  const quantity = quantityText.value.trim().replace(/\s+/g, ' ')
  const done = await shopping.add(name, quantity === '' ? null : quantity)
  addingName.value = false
  if (!done) return
  added.value =
    quantity === ''
      ? t('shopping.nameAdded', { name: name.trim() })
      : t('shopping.nameAddedQuantity', { name: name.trim(), quantity })
  quantityText.value = ''
  reset()
}

/**
 * Cocher dit « c'est dans le panier » : l'article reste à sa place, barré, et
 * tous les membres voient la case cochée. Seule la croix le retire.
 */
function toggle(item: ShoppingItemView, checked: boolean): void {
  void shopping.setChecked(item.id, checked)
}

function remove(id: ShoppingItemId): void {
  void shopping.remove([id])
}

/** « 4 articles, dont 1 dans le panier ». */
const summary = computed(() => {
  const total = shopping.items.length
  if (total === 0) return ''
  const checked = shopping.items.filter((item) => item.checked).length
  const count = t('shopping.itemCount', { n: total })
  return checked === 0 ? count : t('shopping.itemCountChecked', { count, checked })
})
</script>

<template>
  <div class="shopping">
    <p class="shopping__back">
      <RouterLink :to="back.to">
        <span aria-hidden="true">←</span> {{ back.label }}
      </RouterLink>
    </p>

    <header>
      <p class="shopping__eyebrow">
        {{ t('shopping.weekOf', { range }) }}
      </p>
      <h1>{{ t('shopping.title') }}</h1>
      <p
        v-if="resolved"
        class="shopping__scope"
      >
        {{ scopeText }}
      </p>
    </header>

    <BaseCard
      :title="t('shopping.fillTitle')"
      :subtitle="t('shopping.fillSubtitle')"
    >
      <ErrorNotice :error="fillError" />
      <BaseButton
        :loading="filling"
        @click="fill"
      >
        {{ t('shopping.fill') }}
      </BaseButton>
      <div
        class="shopping__report"
        role="status"
        aria-live="polite"
      >
        <p
          v-if="fillMessage"
          class="shopping__done"
        >
          {{ fillMessage }}
        </p>
        <p
          v-if="fillMessage && ownMealsOnly"
          class="shopping__note"
        >
          {{ t('shopping.ownMealsOnly') }}
        </p>
        <p
          v-for="member in skipped"
          :key="member.name"
          class="shopping__note"
        >
          {{ skippedText(member) }}
        </p>
      </div>
    </BaseCard>

    <ErrorNotice :error="shopping.error" />

    <BaseCard
      :title="t('shopping.itemsTitle')"
      :subtitle="summary"
    >
      <EmptyState
        v-if="shopping.items.length === 0"
        :title="t('shopping.emptyTitle')"
        :description="t('shopping.emptyDescription')"
      />
      <ul
        v-else
        class="shopping__items"
      >
        <li
          v-for="item in shopping.items"
          :key="item.id"
          class="shopping__item"
          :class="{ 'shopping__item--done': item.checked }"
        >
          <label class="shopping__check">
            <input
              type="checkbox"
              :checked="item.checked"
              @change="toggle(item, ($event.target as HTMLInputElement).checked)"
            >
            <span class="shopping__text">
              <span class="shopping__name">{{ item.name }}</span>
              <template v-if="formatShoppingQuantity(item)">
                <span class="sr-only">, </span>
                <span class="shopping__quantity">{{ formatShoppingQuantity(item) }}</span>
              </template>
              <template v-else-if="item.foodItemId !== null">
                <span class="sr-only">, </span>
                <span class="shopping__quantity">{{ t('shopping.noLongerInMeals') }}</span>
              </template>
            </span>
          </label>
          <BaseButton
            variant="ghost"
            size="sm"
            @click="remove(item.id)"
          >
            <span aria-hidden="true">✕</span>
            <span class="sr-only">{{ t('shopping.removeItem', { name: item.name }) }}</span>
          </BaseButton>
        </li>
      </ul>
    </BaseCard>

    <BaseCard
      :title="t('shopping.addTitle')"
      :subtitle="t('shopping.addSubtitle')"
    >
      <FoodPicker
        :add="addFood"
        :preselect="preselect"
        :busy="shopping.status === 'loading'"
      >
        <template #after="{ query: searched, reset }">
          <div class="shopping__as-is">
            <p class="shopping__note">
              {{ t('shopping.notFood') }}
            </p>
            <BaseField
              v-model="quantityText"
              :label="t('shopping.quantityLabel')"
              :hint="t('shopping.quantityHint')"
            />
            <BaseButton
              size="sm"
              variant="secondary"
              :loading="addingName"
              @click="addName(searched, reset)"
            >
              {{ t('shopping.addAsIs', { name: searched.trim() }) }}
            </BaseButton>
          </div>
        </template>
      </FoodPicker>
      <p
        class="shopping__done"
        role="status"
        aria-live="polite"
      >
        {{ added }}
      </p>
    </BaseCard>
  </div>
</template>

<style scoped lang="scss">
.shopping {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.shopping h1 {
  margin: 0;
}

.shopping__back {
  margin: 0;
  font-size: var(--font-size-sm);
}

.shopping__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.shopping__scope {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.shopping__report {
  margin-top: var(--space-3);
}

.shopping__done {
  margin: 0 0 var(--space-2);
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.shopping__as-is {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.shopping__as-is > :deep(.field) {
  align-self: stretch;
}

.shopping__note {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.shopping__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
}

.shopping__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.shopping__check {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  cursor: pointer;
}

.shopping__check input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent);
}

/* Le nom, puis la quantité dessous : sur un écran étroit, le nom garde
   toute la largeur au lieu d'être comprimé par la quantité. */
.shopping__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.shopping__name {
  overflow-wrap: break-word;
}

.shopping__quantity {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}

.shopping__item--done .shopping__name {
  color: var(--color-text-muted);
  text-decoration: line-through;
}
</style>
