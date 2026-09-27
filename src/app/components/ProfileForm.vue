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
  { legend: 'Mon régime', options: DIET_OPTIONS },
  { legend: 'Aliments à éviter', options: AVOID_OPTIONS },
] as const

type Field = 'name' | 'heightCm' | 'weightKg' | 'ageYears' | 'biologicalSex' | 'activityLevel'

/** Ce qu'il faut écrire, champ par champ, quand il est vide. */
const MISSING: Readonly<Record<Field, string>> = {
  name: 'Écrivez un prénom ou un surnom.',
  heightCm: 'Écrivez votre taille, en centimètres. Par exemple : 170.',
  weightKg: 'Écrivez votre poids, en kilos. Par exemple : 65.',
  ageYears: 'Écrivez votre âge, en années.',
  biologicalSex: 'Choisissez « Femme » ou « Homme ».',
  activityLevel: 'Choisissez votre activité.',
}

const errors = ref<Partial<Record<Field, string>>>({})
const root = ref<HTMLElement | null>(null)

const missingCount = computed(() => Object.keys(errors.value).length)

function isEmptyNumber(value: number): boolean {
  return !Number.isFinite(value) || value <= 0
}

function validate(): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {}
  if (form.name.trim() === '') found.name = MISSING.name
  if (isEmptyNumber(form.heightCm)) found.heightCm = MISSING.heightCm
  if (isEmptyNumber(form.weightKg)) found.weightKg = MISSING.weightKg
  if (isEmptyNumber(form.ageYears)) found.ageYears = MISSING.ageYears
  if (form.biologicalSex === null) found.biologicalSex = MISSING.biologicalSex
  if (form.activityLevel === null) found.activityLevel = MISSING.activityLevel
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
      Il manque {{ missingCount }} information{{ missingCount > 1 ? 's' : '' }}. Elles sont
      signalées plus bas.
    </p>

    <BaseCard title="Vous">
      <BaseField
        v-model="form.name"
        label="Prénom ou surnom"
        hint="Il s’affiche sur l’accueil, et dans le foyer si vous en avez un."
        required
        autocomplete="nickname"
        v-bind="errors.name === undefined ? {} : { error: errors.name }"
        @update:model-value="clear('name')"
      />
    </BaseCard>

    <BaseCard
      title="Votre corps"
      subtitle="Ces informations servent à calculer vos besoins. Elles restent privées."
    >
      <div class="profile-form__grid">
        <BaseField
          v-model="form.heightCm"
          label="Taille"
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
          label="Poids"
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
          label="Âge"
          type="number"
          suffix="ans"
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
          Sexe<InfoTip
            term="sexe"
            :text="GLOSSARY.biologicalSex"
          />
          <span class="sr-only">(obligatoire)</span>
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

    <BaseCard title="Votre activité">
      <fieldset
        class="profile-form__fieldset"
        :aria-describedby="errors.activityLevel ? 'profile-activity-error' : undefined"
      >
        <legend class="sr-only">
          Votre activité (obligatoire)
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
      title="Votre régime"
      subtitle="Facultatif. Les aliments qui ne vous conviennent pas seront masqués dans la recherche."
    >
      <fieldset
        v-for="group in RESTRICTION_GROUPS"
        :key="group.legend"
        class="profile-form__fieldset"
      >
        <legend class="profile-form__legend">
          {{ group.legend }}
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
        L’application reconnaît les aliments à leur nom. Elle ne vérifie pas les certifications
        halal ou casher. Lisez toujours l’étiquette.
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
