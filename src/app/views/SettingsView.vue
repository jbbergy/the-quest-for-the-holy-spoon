<script setup lang="ts">
/**
 * Réglages : profil et thème.
 *
 * La liste des thèmes est **générée** depuis les `theme.json` du dossier
 * `styles/themes/` — aucune énumération codée en dur ici. Changer de thème
 * applique le nouveau immédiatement, sans rechargement ni confirmation : c'est
 * un réglage dont l'effet est sa propre prévisualisation.
 */
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useDataExport } from '@/app/useDataExport'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import BaseField from '@/ui/BaseField.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import PasswordField from '@/ui/PasswordField.vue'

/**
 * Panneau de données de démonstration, en développement seulement. Vite
 * remplace `import.meta.env.DEV` par une constante au build : en production,
 * la branche disparaît, et l'import dynamique avec elle.
 */
const DemoDataPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/app/dev/DemoDataPanel.vue'))
  : null

const router = useRouter()
const players = usePlayerStore()
const account = useAccountStore()
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

const accountSync = useAccountSync()
const accountMessage = ref('')
const deletePassword = ref('')
/** Modifications qui n'ont pas pu partir : la déconnexion attend une confirmation. */
const unsent = ref<number | null>(null)

async function signOut(force = false): Promise<void> {
  accountMessage.value = ''
  const outcome = await accountSync.signOut({ force })
  if (!outcome.signedOut) {
    unsent.value = outcome.pending > 0 ? outcome.pending : null
    return
  }
  unsent.value = null
  // La copie locale du compte est effacée : sans autre profil sur l'appareil,
  // on revient à l'accueil.
  if (players.player === null) {
    await router.push({ name: ROUTE.auth })
    return
  }
  accountMessage.value = 'Vous êtes déconnecté. Les données du compte ont été retirées de cet appareil.'
}

async function deleteAccount(): Promise<void> {
  accountMessage.value = ''
  if (!(await accountSync.deleteAccount(deletePassword.value))) return
  deletePassword.value = ''
  accountMessage.value = 'Compte supprimé. Vos données restent sur cet appareil.'
}

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
      title="Compte"
      :subtitle="
        account.session
          ? `Connecté avec ${account.session.email}.`
          : 'Sans compte, tout reste sur cet appareil.'
      "
    >
      <ErrorNotice :error="account.error" />

      <template v-if="account.session">
        <div
          v-if="unsent !== null"
          class="settings__warning"
          role="alert"
        >
          <p>
            {{ unsent === Infinity ? 'Des modifications' : `${unsent} modification${unsent > 1 ? 's' : ''}` }}
            n’ont pas pu être envoyées : le serveur est injoignable. En vous déconnectant
            maintenant, vous les perdrez.
          </p>
          <div class="settings__actions">
            <BaseButton
              variant="danger"
              @click="signOut(true)"
            >
              Me déconnecter quand même
            </BaseButton>
            <BaseButton
              variant="secondary"
              @click="unsent = null"
            >
              Rester connecté
            </BaseButton>
          </div>
        </div>
        <BaseButton
          v-else
          variant="secondary"
          :loading="account.status === 'loading'"
          @click="signOut()"
        >
          Se déconnecter
        </BaseButton>
        <p class="settings__note">
          À la déconnexion, les données du compte sont retirées de cet appareil ; elles restent
          sur votre compte.
        </p>

        <details class="settings__danger">
          <summary>Supprimer mon compte</summary>
          <form
            class="settings__form"
            novalidate
            @submit.prevent="deleteAccount"
          >
            <p class="settings__note settings__note--body">
              Le compte est effacé du serveur, définitivement. Les données de cet appareil sont
              conservées : vous pourrez continuer sans compte.
            </p>
            <PasswordField
              v-model="deletePassword"
              label="Mot de passe, pour confirmer"
              autocomplete="current-password"
              required
            />
            <BaseButton
              type="submit"
              variant="danger"
              :loading="account.status === 'loading'"
            >
              Supprimer définitivement
            </BaseButton>
          </form>
        </details>
      </template>

      <template v-else-if="account.status === 'unreachable'">
        <p class="settings__note settings__note--body">
          Le serveur des comptes ne répond pas : impossible de savoir si vous êtes connecté.
        </p>
        <BaseButton
          variant="secondary"
          @click="account.load()"
        >
          Réessayer
        </BaseButton>
      </template>

      <div
        v-else
        class="settings__actions"
      >
        <BaseButton @click="router.push({ name: ROUTE.signIn })">
          Se connecter
        </BaseButton>
        <BaseButton
          variant="secondary"
          @click="router.push({ name: ROUTE.signUp })"
        >
          Créer un compte
        </BaseButton>
      </div>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        {{ accountMessage }}
      </p>
    </BaseCard>

    <BaseCard
      title="Vos données"
      :subtitle="
        account.session
          ? 'Votre profil et vos repas sont sur cet appareil et sur votre compte.'
          : 'Votre profil et vos repas sont stockés sur cet appareil.'
      "
    >
      <p class="settings__note settings__note--body">
        Le fichier contient votre profil, tous vos repas — passés et prévus — et
        les aliments que vous avez créés. Le catalogue Ciqual en est
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
          <dt>Besoin habituel</dt>
          <dd>{{ Math.round(players.profileView.targetCalories) }} kcal</dd>
        </div>
      </dl>
      <p class="settings__note">
        Estimation par l’équation de Mifflin-St Jeor, pondérée par votre niveau d’activité.
        L’accueil compare aussi vos apports moyens des sept derniers jours à ces besoins.
      </p>
    </BaseCard>

    <component
      :is="DemoDataPanel"
      v-if="DemoDataPanel"
    />
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

.settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.settings__warning {
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
}

.settings__danger {
  margin-top: var(--space-4);
}

.settings__danger summary {
  display: flex;
  align-items: center;
  min-height: 44px;
  color: var(--color-danger);
  font-weight: 600;
  cursor: pointer;
}

.settings__danger[open] summary {
  margin-bottom: var(--space-3);
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
