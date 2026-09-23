<script setup lang="ts">
/**
 * Onboarding : le seul formulaire long de l'application.
 *
 * La validation reste celle du domaine. Le formulaire n'en réimplémente aucune :
 * il soumet, et affiche l'erreur typée remontée par le Use Case. Dupliquer les
 * bornes physiologiques ici garantirait qu'elles divergent un jour.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryRestriction } from '@/modules/player_profile/domain/DietaryPreferences'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const router = useRouter()
const players = usePlayerStore()
const { connect } = useAccountSync()

const name = ref('')
const heightCm = ref(175)
const weightKg = ref(70)
const ageYears = ref(30)
const biologicalSex = ref<BiologicalSex>(BiologicalSex.FEMALE)
const activityLevel = ref<ActivityLevel>(ActivityLevel.MODERATE)
const restrictions = ref<DietaryRestriction[]>([])

const submitting = ref(false)

const SEX_OPTIONS = [
  { value: BiologicalSex.FEMALE, label: 'Femme' },
  { value: BiologicalSex.MALE, label: 'Homme' },
] as const

const ACTIVITY_OPTIONS = [
  { value: ActivityLevel.SEDENTARY, label: 'Sédentaire', hint: 'Peu ou pas d’exercice' },
  { value: ActivityLevel.LIGHT, label: 'Légère', hint: '1 à 3 séances par semaine' },
  { value: ActivityLevel.MODERATE, label: 'Modérée', hint: '3 à 5 séances par semaine' },
  { value: ActivityLevel.ACTIVE, label: 'Soutenue', hint: '6 à 7 séances par semaine' },
  { value: ActivityLevel.VERY_ACTIVE, label: 'Intense', hint: 'Métier physique ou biquotidien' },
] as const

const RESTRICTION_OPTIONS = [
  { value: DietaryRestriction.GLUTEN_FREE, label: 'Sans gluten' },
  { value: DietaryRestriction.LACTOSE_FREE, label: 'Sans lactose' },
  { value: DietaryRestriction.VEGETARIAN, label: 'Végétarien' },
  { value: DietaryRestriction.VEGAN, label: 'Végan' },
  { value: DietaryRestriction.PESCATARIAN, label: 'Pescétarien' },
] as const

const canSubmit = computed(() => name.value.trim().length > 0 && !submitting.value)

function toggleRestriction(value: DietaryRestriction): void {
  restrictions.value = restrictions.value.includes(value)
    ? restrictions.value.filter((entry) => entry !== value)
    : [...restrictions.value, value]
}

async function submit(): Promise<void> {
  submitting.value = true
  const created = await players.create({
    name: name.value,
    heightCm: heightCm.value,
    weightKg: weightKg.value,
    ageYears: ageYears.value,
    biologicalSex: biologicalSex.value,
    activityLevel: activityLevel.value,
    restrictions: restrictions.value,
  })
  submitting.value = false

  if (!created) return
  // Connecté avant d'avoir un profil : le nouveau profil rejoint le compte.
  await connect()
  await router.push({ name: ROUTE.dashboard })
}
</script>

<template>
  <div class="setup">
    <header>
      <h1>Créons votre profil</h1>
      <p class="setup__intro">
        Ces informations servent à estimer vos besoins caloriques. Elles restent sur cet
        appareil. Si vous vous connectez, vos mensurations ne sont jamais montrées à personne.
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <form
      class="setup__form"
      novalidate
      @submit.prevent="submit"
    >
      <BaseCard title="Identité">
        <BaseField
          v-model="name"
          label="Nom du profil"
          required
          autocomplete="nickname"
          placeholder="Perceval"
        />
      </BaseCard>

      <BaseCard title="Mesures">
        <div class="setup__grid">
          <BaseField
            v-model="heightCm"
            label="Taille"
            type="number"
            suffix="cm"
            :min="50"
            :max="272"
          />
          <BaseField
            v-model="weightKg"
            label="Poids"
            type="number"
            suffix="kg"
            :min="20"
            :max="640"
            :step="0.1"
          />
          <BaseField
            v-model="ageYears"
            label="Âge"
            type="number"
            suffix="ans"
            :min="13"
            :max="120"
          />
        </div>

        <fieldset class="setup__fieldset">
          <legend class="setup__legend">
            Sexe biologique
          </legend>
          <p class="setup__legend-hint">
            Utilisé uniquement par l’équation de métabolisme de base.
          </p>
          <div class="setup__choices">
            <label
              v-for="option in SEX_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                v-model="biologicalSex"
                type="radio"
                name="sex"
                :value="option.value"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
      </BaseCard>

      <BaseCard title="Rythme de vie">
        <fieldset class="setup__fieldset">
          <legend class="sr-only">
            Niveau d’activité
          </legend>
          <div class="setup__choices setup__choices--stacked">
            <label
              v-for="option in ACTIVITY_OPTIONS"
              :key="option.value"
              class="choice choice--wide"
            >
              <input
                v-model="activityLevel"
                type="radio"
                name="activity"
                :value="option.value"
              >
              <span>
                <strong>{{ option.label }}</strong>
                <small>{{ option.hint }}</small>
              </span>
            </label>
          </div>
        </fieldset>
      </BaseCard>

      <BaseCard
        title="Régime"
        subtitle="Facultatif — sert à écarter les aliments incompatibles."
      >
        <fieldset class="setup__fieldset">
          <legend class="sr-only">
            Restrictions alimentaires
          </legend>
          <div class="setup__choices">
            <label
              v-for="option in RESTRICTION_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                type="checkbox"
                :value="option.value"
                :checked="restrictions.includes(option.value)"
                @change="toggleRestriction(option.value)"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>
      </BaseCard>

      <BaseButton
        type="submit"
        block
        :disabled="!canSubmit"
        :loading="submitting"
      >
        Commencer la quête
      </BaseButton>
    </form>
  </div>
</template>

<style scoped lang="scss">
.setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setup__intro {
  color: var(--color-text-muted);
}

.setup__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setup__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-3);
}

.setup__fieldset {
  margin: var(--space-4) 0 0;
  padding: 0;
  border: none;
}

.setup__fieldset:first-child {
  margin-top: 0;
}

.setup__legend {
  padding: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.setup__legend-hint {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.setup__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.setup__choices--stacked {
  flex-direction: column;
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

/**
 * Le bouton natif reste visible et cliquable : le remplacer par un pseudo-élément
 * priverait l'utilisateur de l'apparence de contrôle qu'attend son système, et
 * du mode contraste forcé de Windows.
 */
.choice input {
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  font-weight: 600;
}
</style>
