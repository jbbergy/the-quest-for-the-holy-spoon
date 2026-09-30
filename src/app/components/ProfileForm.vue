<script setup lang="ts">
/**
 * Formulaire du profil, pour le créer comme pour le modifier.
 *
 * Deux choix délibérés :
 *
 * - **Aucune valeur par défaut** pour la taille, le poids, l'âge, le sexe et
 *   l'activité. Des valeurs préremplies (175 cm, 70 kg, 30 ans) passaient pour
 *   des réponses : qui ne les changeait pas obtenait des besoins faux, sans le
 *   savoir.
 * - **Un bouton toujours actif.** Un bouton grisé ne dit pas ce qui manque. À
 *   l'envoi, chaque champ vide reçoit une phrase qui dit quoi écrire, et le
 *   focus va au premier (critère 3.3.1).
 *
 * Les bornes physiologiques restent celles du domaine : le formulaire vérifie
 * que rien ne manque, le use case que tout est plausible.
 */
import { computed, nextTick, reactive, ref } from 'vue'

import { GLOSSARY } from '@/app/glossary'
import { ACTIVITY_OPTIONS, AVOID_OPTIONS, DIET_OPTIONS, SEX_OPTIONS } from '@/app/profileOptions'
import { t } from '@/i18n'
import type { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import type { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import type { DietaryRestriction } from '@/modules/player_profile/domain/DietaryPreferences'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import InfoTip from '@/ui/InfoTip.vue'

export interface ProfileFormValues {
  readonly name: string
  readonly heightCm: number
  readonly weightKg: number
  readonly ageYears: number
  readonly biologicalSex: BiologicalSex
  readonly activityLevel: ActivityLevel
  readonly restrictions: readonly DietaryRestriction[]
}

const props = defineProps<{
  /** Le profil à modifier ; absent pour une création. */
  initial?: ProfileFormValues | null
  submitLabel: string
  busy?: boolean
}>()

const emit = defineEmits<{ submit: [values: ProfileFormValues] }>()

const form = reactive({
  name: props.initial?.name ?? '',
  heightCm: props.initial?.heightCm ?? Number.NaN,
  weightKg: props.initial?.weightKg ?? Number.NaN,
  ageYears: props.initial?.ageYears ?? Number.NaN,
  biologicalSex: (props.initial?.biologicalSex ?? null) as BiologicalSex | null,
  activityLevel: (props.initial?.activityLevel ?? null) as ActivityLevel | null,
  restrictions: [...(props.initial?.restrictions ?? [])] as DietaryRestriction[],
})

const RESTRICTION_GROUPS = [
  { legend: 'profile.form.groupDiet', options: DIET_OPTIONS },
  { legend: 'profile.form.groupAvoid', options: AVOID_OPTIONS },
] as const

type Field = 'name' | 'heightCm' | 'weightKg' | 'ageYears' | 'biologicalSex' | 'activityLevel'

/** Ce qu'il faut écrire, champ par champ, quand il est vide. */
/** Ce qu'il manque, dit dans la langue courante au moment de la validation. */
const missing = (field: Field): string => t(`profile.form.missing.${field}`)

const errors = ref<Partial<Record<Field, string>>>({})
const root = ref<HTMLElement | null>(null)

const missingCount = computed(() => Object.keys(errors.value).length)

function isEmptyNumber(value: number): boolean {
  return !Number.isFinite(value) || value <= 0
}

function validate(): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {}
  if (form.name.trim() === '') found.name = missing('name')
  if (isEmptyNumber(form.heightCm)) found.heightCm = missing('heightCm')
  if (isEmptyNumber(form.weightKg)) found.weightKg = missing('weightKg')
  if (isEmptyNumber(form.ageYears)) found.ageYears = missing('ageYears')
  if (form.biologicalSex === null) found.biologicalSex = missing('biologicalSex')
  if (form.activityLevel === null) found.activityLevel = missing('activityLevel')
  return found
}

function toggleRestriction(value: DietaryRestriction): void {
  form.restrictions = form.restrictions.includes(value)
    ? form.restrictions.filter((entry) => entry !== value)
    : [...form.restrictions, value]
}

async function submit(): Promise<void> {
  errors.value = validate()
  if (form.biologicalSex === null || form.activityLevel === null || missingCount.value > 0) {
    await nextTick()
    root.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  emit('submit', {
    name: form.name.trim(),
    heightCm: form.heightCm,
    weightKg: form.weightKg,
    ageYears: form.ageYears,
    biologicalSex: form.biologicalSex,
    activityLevel: form.activityLevel,
    restrictions: form.restrictions,
  })
}

/** Un champ corrigé perd son message aussitôt : il ne ment plus sur ce qui manque. */
function clear(field: Field): void {
  if (errors.value[field] === undefined) return
  const next = { ...errors.value }
  delete next[field]
  errors.value = next
}
</script>

<template>
  <form
    ref="root"
    class="profile-form"
    novalidate
    @submit.prevent="submit"
  >
    <p
      v-if="missingCount > 0"
      class="profile-form__summary"
      role="alert"
    >
      {{ t('profile.form.summary', { n: missingCount }) }}
    </p>

    <BaseCard :title="t('profile.form.you')">
      <BaseField
        v-model="form.name"
        :label="t('profile.form.name')"
        :hint="t('profile.form.nameHint')"
        required
        autocomplete="nickname"
        v-bind="errors.name === undefined ? {} : { error: errors.name }"
        @update:model-value="clear('name')"
      />
    </BaseCard>

    <BaseCard
      :title="t('profile.form.bodyTitle')"
      :subtitle="t('profile.form.bodySubtitle')"
    >
      <div class="profile-form__grid">
        <BaseField
          v-model="form.heightCm"
          :label="t('profile.form.height')"
          type="number"
          suffix="cm"
          required
          :min="50"
          :max="272"
          v-bind="errors.heightCm === undefined ? {} : { error: errors.heightCm }"
          @update:model-value="clear('heightCm')"
        />
        <BaseField
          v-model="form.weightKg"
          :label="t('profile.form.weight')"
          type="number"
          suffix="kg"
          required
          :min="20"
          :max="640"
          :step="0.1"
          v-bind="errors.weightKg === undefined ? {} : { error: errors.weightKg }"
          @update:model-value="clear('weightKg')"
        />
        <BaseField
          v-model="form.ageYears"
          :label="t('profile.form.age')"
          type="number"
          :suffix="t('profile.form.ageSuffix')"
          required
          :min="13"
          :max="120"
          v-bind="errors.ageYears === undefined ? {} : { error: errors.ageYears }"
          @update:model-value="clear('ageYears')"
        />
      </div>

      <fieldset
        class="profile-form__fieldset"
        :aria-describedby="errors.biologicalSex ? 'profile-sex-error' : undefined"
      >
        <legend class="profile-form__legend">
          {{ t('profile.form.sex') }}<InfoTip
            :term="t('profile.form.sexTerm')"
            :text="GLOSSARY.biologicalSex"
          />
          <span class="sr-only">{{ t('ui.required') }}</span>
        </legend>
        <p
          v-if="errors.biologicalSex"
          id="profile-sex-error"
          class="profile-form__error"
          role="alert"
        >
          {{ errors.biologicalSex }}
        </p>
        <div class="profile-form__choices">
          <label
            v-for="option in SEX_OPTIONS"
            :key="option.value"
            class="choice"
          >
            <input
              v-model="form.biologicalSex"
              type="radio"
              name="sex"
              :value="option.value"
              :aria-invalid="errors.biologicalSex ? 'true' : undefined"
              @change="clear('biologicalSex')"
            >
            <span>{{ option.label }}</span>
          </label>
        </div>
      </fieldset>
    </BaseCard>

    <BaseCard :title="t('profile.form.activityTitle')">
      <fieldset
        class="profile-form__fieldset"
        :aria-describedby="errors.activityLevel ? 'profile-activity-error' : undefined"
      >
        <legend class="sr-only">
          {{ t('profile.form.activityLegend') }}
        </legend>
        <p
          v-if="errors.activityLevel"
          id="profile-activity-error"
          class="profile-form__error"
          role="alert"
        >
          {{ errors.activityLevel }}
        </p>
        <div class="profile-form__choices profile-form__choices--stacked">
          <label
            v-for="option in ACTIVITY_OPTIONS"
            :key="option.value"
            class="choice choice--wide"
          >
            <input
              v-model="form.activityLevel"
              type="radio"
              name="activity"
              :value="option.value"
              :aria-invalid="errors.activityLevel ? 'true' : undefined"
              @change="clear('activityLevel')"
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
      :title="t('profile.form.dietTitle')"
      :subtitle="t('profile.form.dietSubtitle')"
    >
      <fieldset
        v-for="group in RESTRICTION_GROUPS"
        :key="group.legend"
        class="profile-form__fieldset"
      >
        <legend class="profile-form__legend">
          {{ t(group.legend) }}
        </legend>
        <div class="profile-form__choices profile-form__choices--stacked">
          <label
            v-for="option in group.options"
            :key="option.value"
            class="choice choice--wide"
          >
            <input
              type="checkbox"
              :value="option.value"
              :checked="form.restrictions.includes(option.value)"
              @change="toggleRestriction(option.value)"
            >
            <span>
              <strong>{{ option.label }}</strong>
              <small>{{ option.hint }}</small>
            </span>
          </label>
        </div>
      </fieldset>
      <p class="profile-form__note">
        {{ t('profile.form.dietNote') }}
      </p>
    </BaseCard>

    <BaseButton
      type="submit"
      block
      :loading="busy"
    >
      {{ submitLabel }}
    </BaseButton>
  </form>
</template>

<style scoped lang="scss">
.profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profile-form__summary {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-weight: 600;
}

.profile-form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-3);
}

.profile-form__fieldset {
  margin: var(--space-4) 0 0;
  padding: 0;
  border: none;
}

.profile-form__fieldset:first-child {
  margin-top: 0;
}

.profile-form__note {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.profile-form__legend {
  padding: 0;
  margin-bottom: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.profile-form__error {
  margin: 0 0 var(--space-2);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.profile-form__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.profile-form__choices--stacked {
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

/* Le bouton natif reste visible : le remplacer priverait l'utilisateur de
   l'apparence de contrôle qu'attend son système, et du contraste forcé. */
.choice input {
  flex: none;
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
