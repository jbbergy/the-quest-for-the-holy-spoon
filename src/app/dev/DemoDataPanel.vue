<script setup lang="ts">
/**
 * Génère et retire les données de démonstration.
 *
 * Réservé au développement : `SettingsView` ne l'importe que sous
 * `import.meta.env.DEV`, ce qui l'exclut du bundle de production.
 *
 * Les identifiants des repas créés sont gardés dans le `localStorage`, et
 * seulement là : c'est une commodité d'essai sur un appareil, pas une donnée
 * de l'application. S'il est vidé, les repas de démonstration restent — et se
 * suppriment un par un depuis la semaine, comme n'importe quel repas.
 */
import { computed, ref } from 'vue'

import { useContainer } from '@/app/container'
import { formatDay } from '@/app/mealLabels'
import { addDays, dayKeyOf } from '@/core/day'
import { type ErrorView, toErrorView } from '@/core/errors'
import type { MealId } from '@/core/identity'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

import { DEMO_SCENARIO, removeDemoData, seedDemoData } from './demoData'

const STORAGE_KEY = 'holy-spoon:demo-meal-ids'

const players = usePlayerStore()

const storedIds = ref<readonly MealId[]>(readIds())
const busy = ref(false)
const status = ref('')
const error = ref<ErrorView | null>(null)

const today = dayKeyOf(new Date())
const scenario = computed(() =>
  DEMO_SCENARIO.map((day) => ({
    day: addDays(today, day.offset),
    purpose: day.purpose,
  })),
)

function readIds(): readonly MealId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is MealId => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeIds(ids: readonly MealId[]): void {
  storedIds.value = ids
  try {
    if (ids.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Stockage indisponible (navigation privée) : les repas existent quand
    // même, seul le retrait en un clic est perdu.
  }
}

async function removeStored(): Promise<boolean> {
  const removed = await removeDemoData(useContainer(), storedIds.value)
  if (!removed.ok) {
    error.value = toErrorView(removed.error)
    return false
  }
  writeIds([])
  return true
}

async function generate(): Promise<void> {
  const playerId = players.playerId
  const needs = players.needs
  if (playerId === null || needs === null) return

  busy.value = true
  status.value = ''
  error.value = null

  // Régénérer remplace : deux jeux superposés doubleraient chaque journée.
  if (storedIds.value.length > 0 && !(await removeStored())) {
    busy.value = false
    return
  }

  const { created, error: failure } = await seedDemoData({
    container: useContainer(),
    playerId,
    dailyCalories: needs.targetCalories,
    today,
  })
  writeIds(created)
  busy.value = false

  if (failure !== null) {
    error.value = toErrorView(failure)
    return
  }
  status.value = `${created.length} repas créés sur ${DEMO_SCENARIO.length} jours.`
}

async function remove(): Promise<void> {
  busy.value = true
  status.value = ''
  error.value = null
  const count = storedIds.value.length
  if (await removeStored()) status.value = `${count} repas de démonstration retirés.`
  busy.value = false
}
</script>

<template>
  <BaseCard
    title="Données de démonstration"
    subtitle="Visible en développement uniquement."
  >
    <p class="demo__note">
      Crée dix jours de repas autour d’aujourd’hui, dans votre profil, pour voir les moyennes de
      la semaine sur l’accueil, et la semaine elle-même. Les portions sont calculées sur votre
      besoin habituel. Vos propres repas de ces jours-là restent, et comptent aussi.
    </p>

    <details class="demo__scenario">
      <summary class="demo__summary">
        Voir le scénario
      </summary>
      <ul class="demo__days">
        <li
          v-for="entry in scenario"
          :key="entry.day"
        >
          <strong>{{ formatDay(entry.day) }}</strong> — {{ entry.purpose }}
        </li>
      </ul>
    </details>

    <div class="demo__actions">
      <BaseButton
        variant="secondary"
        :loading="busy"
        :disabled="players.needs === null"
        @click="generate"
      >
        {{ storedIds.length > 0 ? 'Régénérer les données' : 'Générer les données' }}
      </BaseButton>
      <BaseButton
        v-if="storedIds.length > 0"
        variant="ghost"
        :disabled="busy"
        @click="remove"
      >
        Retirer les données de démonstration
      </BaseButton>
    </div>

    <p
      class="demo__status"
      role="status"
      aria-live="polite"
    >
      {{ status }}
    </p>

    <ErrorNotice :error="error" />
  </BaseCard>
</template>

<style scoped lang="scss">
.demo__note {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.demo__summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
}

.demo__days {
  margin: 0 0 var(--space-3);
  padding-left: var(--space-4);
  font-size: var(--font-size-sm);
}

.demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.demo__status {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-sm);
}
</style>
