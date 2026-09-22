<script setup lang="ts">
/**
 * Réglages : profil et thème.
 *
 * La liste des thèmes est **générée** depuis les `theme.json` du dossier
 * `styles/themes/` — aucune énumération codée en dur ici. Changer de thème
 * applique le nouveau immédiatement, sans rechargement ni confirmation : c'est
 * un réglage dont l'effet est sa propre prévisualisation.
 */
import { ref, watch } from 'vue'

import { useDataExport } from '@/app/useDataExport'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const players = usePlayerStore()
const theme = useThemeStore()
const dataExport = useDataExport()

const weightKg = ref(players.player?.measurements.weightKg ?? 70)
const activityLevel = ref<ActivityLevel>(players.player?.activityLevel ?? ActivityLevel.MODERATE)
const saved = ref('')

// Le profil peut arriver après le montage (chargement asynchrone) : les champs
// se réalignent sur lui plutôt que de rester sur leurs valeurs de repli.
watch(
  () => players.player,
  (player) => {
    if (player === null) return
    weightKg.value = player.measurements.weightKg
    activityLevel.value = player.activityLevel
  },
  { immediate: true },
)

const ACTIVITY_OPTIONS = [
  { value: ActivityLevel.SEDENTARY, label: 'Sédentaire' },
  { value: ActivityLevel.LIGHT, label: 'Légère' },
  { value: ActivityLevel.MODERATE, label: 'Modérée' },
  { value: ActivityLevel.ACTIVE, label: 'Soutenue' },
  { value: ActivityLevel.VERY_ACTIVE, label: 'Intense' },
] as const

async function save(): Promise<void> {
  saved.value = ''
  const updated = await players.update({
    weightKg: weightKg.value,
    activityLevel: activityLevel.value,
  })
  if (updated) saved.value = 'Profil mis à jour.'
}
</script>

<template>
  <div class="settings">
    <h1>Réglages</h1>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="theme.error" />

    <BaseCard
      title="Apparence"
      subtitle="Le thème s’applique immédiatement et reste mémorisé sur cet appareil."
    >
      <fieldset class="settings__fieldset">
        <legend class="sr-only">
          Thème
        </legend>
        <ul class="settings__themes">
          <li
            v-for="entry in theme.available"
            :key="entry.id"
          >
            <label class="choice choice--wide">
              <input
                type="radio"
                name="theme"
                :value="entry.id"
                :checked="theme.currentId === entry.id"
                @change="theme.select(entry.id)"
              >
              <span>
                <strong>{{ entry.name }}</strong>
                <small>{{ entry.description }}</small>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>
    </BaseCard>

    <BaseCard
      title="Profil"
      subtitle="Ces valeurs déterminent vos besoins caloriques."
    >
      <form
        class="settings__form"
        novalidate
        @submit.prevent="save"
      >
        <BaseField
          v-model="weightKg"
          label="Poids"
          type="number"
          suffix="kg"
          :min="20"
          :max="640"
          :step="0.1"
        />

        <fieldset class="settings__fieldset">
          <legend class="settings__legend">
            Activité
          </legend>
          <div class="settings__choices">
            <label
              v-for="option in ACTIVITY_OPTIONS"
              :key="option.value"
              class="choice"
            >
              <input
                v-model="activityLevel"
                type="radio"
                name="activity"
                :value="option.value"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </fieldset>

        <BaseButton
          type="submit"
          :loading="players.status === 'loading'"
        >
          Enregistrer
        </BaseButton>
      </form>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        {{ saved }}
      </p>
    </BaseCard>

    <BaseCard
      title="Vos données"
      subtitle="Tout est stocké sur cet appareil, et nulle part ailleurs."
    >
      <p class="settings__note settings__note--body">
        Le fichier contient votre profil, votre progression, tout votre historique
        de repas et les aliments que vous avez créés. Le catalogue Ciqual en est
        absent : l’application le régénère seule.
      </p>

      <BaseButton
        variant="secondary"
        :loading="dataExport.busy.value"
        @click="dataExport.run()"
      >
        Exporter mes données
      </BaseButton>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        <template v-if="dataExport.lastFileName.value">
          Export enregistré sous {{ dataExport.lastFileName.value }}.
        </template>
      </p>

      <ErrorNotice :error="dataExport.error.value" />
    </BaseCard>

    <BaseCard
      v-if="players.profileView"
      title="Besoins estimés"
    >
      <dl class="settings__needs">
        <div>
          <dt>Métabolisme de base</dt>
          <dd>{{ Math.round(players.profileView.basalMetabolicRate) }} kcal</dd>
        </div>
        <div>
          <dt>Dépense totale</dt>
          <dd>{{ Math.round(players.profileView.totalDailyEnergyExpenditure) }} kcal</dd>
        </div>
        <div>
          <dt>Cible du jour</dt>
          <dd>{{ Math.round(players.profileView.targetCalories) }} kcal</dd>
        </div>
      </dl>
      <p class="settings__note">
        Estimation par l’équation de Mifflin-St Jeor, pondérée par votre niveau d’activité.
      </p>
    </BaseCard>
  </div>
</template>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.settings__fieldset {
  margin: 0;
  padding: 0;
  border: none;
}

.settings__legend {
  padding: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.settings__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.settings__themes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings__saved {
  margin: var(--space-3) 0 0;
  min-height: 1.25rem;
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.settings__needs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
}

.settings__needs div {
  display: flex;
  flex-direction: column;
}

.settings__needs dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.settings__needs dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.settings__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

/* Le même bloc, mais lu comme du texte courant et non comme une mention de bas
   de carte : il explique ce que contient le fichier avant qu'on le produise. */
.settings__note--body {
  margin-bottom: var(--space-4);
  color: var(--color-text);
  font-size: var(--font-size-sm);
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

.choice input {
  accent-color: var(--color-accent);
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
</style>
