<script setup lang="ts">
/**
 * Réglages : le profil, les besoins, les aliments, la journée, l'apparence,
 * le compte, le foyer et les données.
 *
 * Le profil ne se modifie pas ici : l'écran en montre le résumé, et
 * « Modifier mon profil » ouvre le même formulaire qu'à la création — tout y
 * est modifiable, pas seulement le poids.
 *
 * La liste des thèmes est **générée** depuis les `theme.json` du dossier
 * `styles/themes/` — aucune énumération codée en dur ici. Changer de thème
 * applique le nouveau immédiatement, sans rechargement ni confirmation : c'est
 * un réglage dont l'effet est sa propre prévisualisation.
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { useRouter } from 'vue-router'

import { DAY_START_HOURS } from '@/app/day/DayStartPreference'
import { useTodayStore } from '@/app/day/useTodayStore'
import { GLOSSARY } from '@/app/glossary'
import { ACTIVITY_OPTIONS, RESTRICTION_OPTIONS, SEX_OPTIONS } from '@/app/profileOptions'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useHousehold } from '@/app/useHousehold'
import { useDataExport } from '@/app/useDataExport'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import InfoTip from '@/ui/InfoTip.vue'
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
const household = useHousehold()
const clock = useTodayStore()

function hourLabel(hour: number): string {
  return hour === 0 ? 'Minuit' : hour === 12 ? 'Midi' : `${hour} h`
}

function selectDayStart(event: Event): void {
  clock.setStartHour(Number((event.target as HTMLSelectElement).value))
}

/** Le profil, en mots : ce que l'on a saisi, tel qu'on l'a choisi. */
const profileSummary = computed(() => {
  const view = players.profileView
  if (view === null) return null
  const activity = ACTIVITY_OPTIONS.find((option) => option.value === view.activityLevel)
  const diets = RESTRICTION_OPTIONS.filter((option) => view.restrictions.includes(option.value))
  const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
  return [
    { label: 'Prénom ou surnom', value: view.name },
    { label: 'Taille', value: `${decimal.format(view.heightCm)} cm` },
    { label: 'Poids', value: `${decimal.format(view.weightKg)} kg` },
    { label: 'Âge', value: `${view.ageYears} ans` },
    {
      label: 'Sexe',
      value: SEX_OPTIONS.find((option) => option.value === view.biologicalSex)?.label ?? '',
    },
    {
      label: 'Activité',
      value: activity === undefined ? '' : `${activity.label} (${activity.hint.toLocaleLowerCase('fr-FR')})`,
    },
    {
      label: 'Régime',
      value: diets.length === 0 ? 'Aucun' : diets.map((option) => option.label).join(', '),
    },
  ]
})

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
  accountMessage.value =
    'Vous êtes déconnecté. Les données du compte sont retirées de cet appareil.'
}

async function deleteAccount(): Promise<void> {
  accountMessage.value = ''
  if (!(await accountSync.deleteAccount(deletePassword.value))) return
  deletePassword.value = ''
  accountMessage.value = 'Votre compte est supprimé. Vos données restent sur cet appareil.'
}

const sharingMessage = ref('')

async function toggleSharing(event: Event): Promise<void> {
  const sharesDays = (event.target as HTMLInputElement).checked
  sharingMessage.value = ''
  household.clearError()
  if (await household.setDaySharing(sharesDays)) {
    sharingMessage.value = sharesDays
      ? 'Le foyer voit de nouveau vos journées.'
      : 'Le foyer ne voit plus vos journées.'
  }
}
</script>

<template>
  <div class="settings">
    <h1>Réglages</h1>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="theme.error" />

    <BaseCard
      v-if="profileSummary"
      title="Mon profil"
    >
      <dl class="settings__summary">
        <div
          v-for="line in profileSummary"
          :key="line.label"
        >
          <dt>{{ line.label }}</dt>
          <dd>{{ line.value }}</dd>
        </div>
      </dl>
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.profileEdit })"
      >
        Modifier mon profil
      </BaseButton>
    </BaseCard>

    <BaseCard
      v-if="players.profileView"
      title="Mes besoins"
      subtitle="L’application les calcule avec votre profil."
    >
      <dl class="settings__needs">
        <div>
          <dt>
            Au repos<InfoTip
              term="énergie au repos"
              :text="GLOSSARY.basalMetabolism"
            />
          </dt>
          <dd>{{ Math.round(players.profileView.basalMetabolicRate) }} kcal par jour</dd>
        </div>
        <div>
          <dt>
            Votre besoin<InfoTip
              term="besoin"
              :text="GLOSSARY.needs"
            />
          </dt>
          <dd>{{ Math.round(players.profileView.targetCalories) }} kcal par jour</dd>
        </div>
      </dl>
      <p class="settings__note">
        Votre besoin, c’est l’énergie au repos, plus celle de vos activités. C’est une
        estimation<InfoTip
          term="comment c’est calculé"
          :text="GLOSSARY.formula"
        />.
      </p>
    </BaseCard>

    <BaseCard
      title="Mes aliments"
      subtitle="Les aliments que vous avez créés vous-même."
    >
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.foods })"
      >
        Voir mes aliments
      </BaseButton>
    </BaseCard>

    <BaseCard
      title="Mes recettes"
      subtitle="Les repas que vous avez gardés, pour les ajouter d’un geste."
    >
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.recipes })"
      >
        Voir mes recettes
      </BaseButton>
    </BaseCard>

    <BaseCard
      title="Début de la journée"
      subtitle="Ce réglage vaut pour cet appareil seulement."
    >
      <label
        class="settings__legend"
        for="day-start"
      >
        Ma journée commence à
      </label>
      <select
        id="day-start"
        class="settings__select"
        aria-describedby="day-start-hint"
        :value="clock.startHour"
        @change="selectDayStart"
      >
        <option
          v-for="hour in DAY_START_HOURS"
          :key="hour"
          :value="hour"
        >
          {{ hourLabel(hour) }}
        </option>
      </select>
      <p
        id="day-start-hint"
        class="settings__note"
      >
        Avant cette heure, l’accueil montre encore la veille. Vous dormez la nuit ? Choisissez
        minuit. Vous travaillez la nuit ? Choisissez une heure plus tard.
      </p>
    </BaseCard>

    <BaseCard
      title="Couleurs"
      subtitle="Le changement se voit tout de suite. Il vaut pour cet appareil seulement."
    >
      <fieldset class="settings__fieldset">
        <legend class="sr-only">
          Couleurs de l’application
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
      title="Compte"
      :subtitle="
        account.session
          ? `Vous êtes connecté avec ${account.session.email}.`
          : 'Sans compte, vos données restent sur cet appareil.'
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
            {{ unsent === Infinity ? 'Des changements' : `${unsent} changement${unsent > 1 ? 's' : ''}` }}
            n’{{ unsent === 1 ? 'a' : 'ont' }} pas encore été envoyé{{ unsent === 1 ? '' : 's' }} :
            le serveur ne répond pas.
          </p>
          <p>Si vous vous déconnectez maintenant, vous les perdrez.</p>
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
          Me déconnecter
        </BaseButton>
        <p class="settings__note">
          Si vous vous déconnectez, les données du compte sont retirées de cet appareil. Elles
          restent sur votre compte.
        </p>

        <details class="settings__danger">
          <summary>Supprimer mon compte</summary>
          <form
            class="settings__form"
            novalidate
            @submit.prevent="deleteAccount"
          >
            <p class="settings__note settings__note--body">
              Votre compte sera supprimé pour toujours. Les données de cet appareil restent : vous
              pourrez continuer sans compte.
            </p>
            <PasswordField
              v-model="deletePassword"
              label="Votre mot de passe, pour confirmer"
              autocomplete="current-password"
              required
            />
            <BaseButton
              type="submit"
              variant="danger"
              :loading="account.status === 'loading'"
            >
              Supprimer mon compte pour toujours
            </BaseButton>
          </form>
        </details>
      </template>

      <template v-else-if="account.status === 'unreachable'">
        <p class="settings__note settings__note--body">
          Le serveur des comptes ne répond pas. Nous ne savons pas si vous êtes connecté.
        </p>
        <BaseButton
          variant="secondary"
          @click="account.load()"
        >
          Réessayer
        </BaseButton>
      </template>

      <template v-else>
        <p class="settings__note settings__note--body">
          Avec un compte, vous retrouvez vos repas sur vos autres appareils. Vous pouvez aussi
          partager vos repas avec votre foyer<InfoTip
            term="foyer"
            :text="GLOSSARY.household"
          />.
        </p>
        <div class="settings__actions">
          <BaseButton @click="router.push({ name: ROUTE.signIn })">
            Me connecter
          </BaseButton>
          <BaseButton
            variant="secondary"
            @click="router.push({ name: ROUTE.signUp })"
          >
            Créer un compte
          </BaseButton>
        </div>
      </template>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        {{ accountMessage }}
      </p>
    </BaseCard>

    <BaseCard
      v-if="account.session && household.household"
      title="Foyer"
      :subtitle="`Vous faites partie du foyer « ${household.household.name} ».`"
    >
      <ErrorNotice :error="household.error" />
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          :checked="household.household.sharesDays"
          aria-describedby="sharing-hint"
          @change="toggleSharing"
        >
        <span>Montrer mes journées au foyer</span>
      </label>
      <p
        id="sharing-hint"
        class="settings__note"
      >
        Les autres membres voient vos repas et vos jauges. Ils ne voient jamais votre taille,
        votre poids ni votre âge.
      </p>
      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        {{ sharingMessage }}
      </p>
    </BaseCard>

    <BaseCard
      title="Mes données"
      :subtitle="
        account.session
          ? 'Votre profil et vos repas sont sur cet appareil et sur votre compte.'
          : 'Votre profil et vos repas sont sur cet appareil.'
      "
    >
      <p class="settings__note settings__note--body">
        Vous pouvez télécharger un fichier avec votre profil, tous vos repas et les aliments que
        vous avez créés.
      </p>

      <BaseButton
        variant="secondary"
        :loading="dataExport.busy.value"
        @click="dataExport.run()"
      >
        Télécharger mes données
      </BaseButton>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        <template v-if="dataExport.lastFileName.value">
          Fichier enregistré : {{ dataExport.lastFileName.value }}.
        </template>
      </p>

      <ErrorNotice :error="dataExport.error.value" />
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

.settings__select {
  display: block;
  min-width: 10rem;
  min-height: 44px;
  padding: 0 var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
}

.settings__select:focus-visible {
  border-color: var(--color-accent);
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

.settings__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.settings__summary div {
  display: flex;
  flex-direction: column;
}

.settings__summary dt {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.settings__summary dd {
  margin: 0;
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
  font-size: var(--font-size-sm);
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

.switch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  margin-bottom: var(--space-2);
  font-weight: 600;
  cursor: pointer;
}

/* Un interrupteur dessiné sur la case native : le rôle `switch`, le clavier et
   l'annonce « activé / désactivé » restent ceux du navigateur. */
.switch input {
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 2.75rem;
  height: 1.5rem;
  margin: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.switch input::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.5rem - 6px);
  height: calc(1.5rem - 6px);
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: transform var(--duration-fast) var(--ease-out);
}

.switch input:checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.switch input:checked::after {
  background: var(--color-accent-contrast);
  transform: translateX(1.25rem);
}

.choice:has(input:checked) {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}
</style>
