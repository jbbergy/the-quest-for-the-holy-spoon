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
import { lower, numberFormat, t, te } from '@/i18n'
import { AUTO_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locale'
import { useLocaleStore } from '@/i18n/useLocaleStore'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import InfoTip from '@/ui/InfoTip.vue'
import PasswordField from '@/ui/PasswordField.vue'
import RichText from '@/ui/RichText.vue'

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
const locale = useLocaleStore()
const dataExport = useDataExport()
const household = useHousehold()
const clock = useTodayStore()

function hourLabel(hour: number): string {
  if (hour === 0) return t('settings.dayStart.midnight')
  if (hour === 12) return t('settings.dayStart.noon')
  return t('settings.dayStart.hour', { hour })
}

/** Les thèmes portent un nom français dans leur `theme.json` ; les traductions le remplacent. */
function themeName(entry: { id: string; name: string }): string {
  const key = `settings.colors.${entry.id}.name`
  return te(key) ? t(key) : entry.name
}

function themeDescription(entry: { id: string; description: string }): string {
  const key = `settings.colors.${entry.id}.description`
  return te(key) ? t(key) : entry.description
}

/** La langue de l'appareil, en toutes lettres, pour dire ce que « Automatique » donne. */
const deviceLanguage = computed(() => t(`settings.language.${locale.deviceLocale()}`))

function selectDayStart(event: Event): void {
  clock.setStartHour(Number((event.target as HTMLSelectElement).value))
}

/** Le profil, en mots : ce que l'on a saisi, tel qu'on l'a choisi. */
const profileSummary = computed(() => {
  const view = players.profileView
  if (view === null) return null
  const activity = ACTIVITY_OPTIONS.find((option) => option.value === view.activityLevel)
  const diets = RESTRICTION_OPTIONS.filter((option) => view.restrictions.includes(option.value))
  const decimal = numberFormat({ maximumFractionDigits: 1 })
  return [
    { label: t('settings.profile.name'), value: view.name },
    { label: t('settings.profile.height'), value: `${decimal.format(view.heightCm)} cm` },
    { label: t('settings.profile.weight'), value: `${decimal.format(view.weightKg)} kg` },
    { label: t('settings.profile.age'), value: t('settings.profile.ageValue', { n: view.ageYears }) },
    {
      label: t('settings.profile.sex'),
      value: SEX_OPTIONS.find((option) => option.value === view.biologicalSex)?.label ?? '',
    },
    {
      label: t('settings.profile.activity'),
      value: activity === undefined ? '' : `${activity.label} (${lower(activity.hint)})`,
    },
    {
      label: t('settings.profile.diet'),
      value:
        diets.length === 0
          ? t('settings.profile.noDiet')
          : diets.map((option) => option.label).join(', '),
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
  accountMessage.value = t('settings.account.signedOut')
}

async function deleteAccount(): Promise<void> {
  accountMessage.value = ''
  if (!(await accountSync.deleteAccount(deletePassword.value))) return
  deletePassword.value = ''
  accountMessage.value = t('settings.account.deleted')
}

const sharingMessage = ref('')

async function toggleSharing(event: Event): Promise<void> {
  const sharesDays = (event.target as HTMLInputElement).checked
  sharingMessage.value = ''
  household.clearError()
  if (await household.setDaySharing(sharesDays)) {
    sharingMessage.value = sharesDays
      ? t('settings.household.shared')
      : t('settings.household.unshared')
  }
}
</script>

<template>
  <div class="settings">
    <h1>{{ t('settings.title') }}</h1>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="theme.error" />

    <BaseCard
      v-if="profileSummary"
      :title="t('settings.profile.title')"
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
        {{ t('settings.profile.edit') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      v-if="players.profileView"
      :title="t('settings.needs.title')"
      :subtitle="t('settings.needs.subtitle')"
    >
      <dl class="settings__needs">
        <div>
          <dt>
            {{ t('settings.needs.resting') }}<InfoTip
              :term="t('labels.term.restingEnergy')"
              :text="GLOSSARY.basalMetabolism"
            />
          </dt>
          <dd>{{ t('settings.needs.perDay', { kcal: Math.round(players.profileView.basalMetabolicRate) }) }}</dd>
        </div>
        <div>
          <dt>
            {{ t('settings.needs.yourNeed') }}<InfoTip
              :term="t('labels.term.need')"
              :text="GLOSSARY.needs"
            />
          </dt>
          <dd>{{ t('settings.needs.perDay', { kcal: Math.round(players.profileView.targetCalories) }) }}</dd>
        </div>
      </dl>
      <p class="settings__note">
        <RichText path="settings.needs.note">
          <template #tip>
            <InfoTip
              :term="t('labels.term.howCalculated')"
              :text="GLOSSARY.formula"
            />
          </template>
        </RichText>
      </p>
    </BaseCard>

    <BaseCard
      :title="t('settings.foods.title')"
      :subtitle="t('settings.foods.subtitle')"
    >
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.foods })"
      >
        {{ t('settings.foods.open') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      :title="t('settings.recipes.title')"
      :subtitle="t('settings.recipes.subtitle')"
    >
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.recipes })"
      >
        {{ t('settings.recipes.open') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      :title="t('settings.calculations.title')"
      :subtitle="t('settings.calculations.subtitle')"
    >
      <BaseButton
        variant="secondary"
        @click="router.push({ name: ROUTE.calculations })"
      >
        {{ t('settings.calculations.open') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      :title="t('settings.dayStart.title')"
      :subtitle="t('settings.dayStart.subtitle')"
    >
      <label
        class="settings__legend"
        for="day-start"
      >
        {{ t('settings.dayStart.label') }}
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
        {{ t('settings.dayStart.hint') }}
      </p>
    </BaseCard>

    <BaseCard
      :title="t('settings.language.title')"
      :subtitle="t('settings.language.subtitle')"
    >
      <fieldset class="settings__fieldset">
        <legend class="sr-only">
          {{ t('settings.language.legend') }}
        </legend>
        <ul class="settings__themes">
          <li
            v-for="choice in [AUTO_LOCALE, ...SUPPORTED_LOCALES]"
            :key="choice"
          >
            <label class="choice choice--wide">
              <input
                type="radio"
                name="locale"
                :value="choice"
                :checked="locale.preference === choice"
                @change="locale.select(choice)"
              >
              <span>
                <template v-if="choice === AUTO_LOCALE">
                  <strong>{{ t('settings.language.auto') }}</strong>
                  <small>{{ t('settings.language.autoHint', { language: deviceLanguage }) }}</small>
                </template>
                <strong v-else>{{ t(`settings.language.${choice}`) }}</strong>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>
    </BaseCard>

    <BaseCard
      :title="t('settings.colors.title')"
      :subtitle="t('settings.colors.subtitle')"
    >
      <fieldset class="settings__fieldset">
        <legend class="sr-only">
          {{ t('settings.colors.legend') }}
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
                <strong>{{ themeName(entry) }}</strong>
                <small>{{ themeDescription(entry) }}</small>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>
    </BaseCard>

    <BaseCard
      :title="t('settings.account.title')"
      :subtitle="
        account.session
          ? t('settings.account.signedInAs', { email: account.session.email })
          : t('settings.account.noAccount')
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
            {{ unsent === Infinity ? t('settings.account.unsentSome') : t('settings.account.unsent', { n: unsent }) }}
          </p>
          <p>{{ t('settings.account.loseThem') }}</p>
          <div class="settings__actions">
            <BaseButton
              variant="danger"
              @click="signOut(true)"
            >
              {{ t('settings.account.signOutAnyway') }}
            </BaseButton>
            <BaseButton
              variant="secondary"
              @click="unsent = null"
            >
              {{ t('settings.account.stay') }}
            </BaseButton>
          </div>
        </div>
        <BaseButton
          v-else
          variant="secondary"
          :loading="account.status === 'loading'"
          @click="signOut()"
        >
          {{ t('settings.account.signOut') }}
        </BaseButton>
        <p class="settings__note">
          {{ t('settings.account.signOutNote') }}
        </p>

        <details class="settings__danger">
          <summary>{{ t('settings.account.deleteSummary') }}</summary>
          <form
            class="settings__form"
            novalidate
            @submit.prevent="deleteAccount"
          >
            <p class="settings__note settings__note--body">
              {{ t('settings.account.deleteNote') }}
            </p>
            <PasswordField
              v-model="deletePassword"
              :label="t('settings.account.deletePassword')"
              autocomplete="current-password"
              required
            />
            <BaseButton
              type="submit"
              variant="danger"
              :loading="account.status === 'loading'"
            >
              {{ t('settings.account.deleteButton') }}
            </BaseButton>
          </form>
        </details>
      </template>

      <template v-else-if="account.status === 'unreachable'">
        <p class="settings__note settings__note--body">
          {{ t('settings.account.unreachable') }}
        </p>
        <BaseButton
          variant="secondary"
          @click="account.load()"
        >
          {{ t('settings.account.retry') }}
        </BaseButton>
      </template>

      <template v-else>
        <p class="settings__note settings__note--body">
          <RichText path="settings.account.withAccount">
            <template #household>
              {{ t('settings.account.householdWord') }}<InfoTip
                :term="t('settings.account.householdWord')"
                :text="GLOSSARY.household"
              />
            </template>
          </RichText>
        </p>
        <div class="settings__actions">
          <BaseButton @click="router.push({ name: ROUTE.signIn })">
            {{ t('settings.account.signIn') }}
          </BaseButton>
          <BaseButton
            variant="secondary"
            @click="router.push({ name: ROUTE.signUp })"
          >
            {{ t('settings.account.create') }}
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
      :title="t('settings.household.title')"
      :subtitle="t('settings.household.subtitle', { name: household.household.name })"
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
        <span>{{ t('settings.household.share') }}</span>
      </label>
      <p
        id="sharing-hint"
        class="settings__note"
      >
        {{ t('settings.household.shareHint') }}
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
      :title="t('settings.data.title')"
      :subtitle="
        account.session ? t('settings.data.subtitleAccount') : t('settings.data.subtitleLocal')
      "
    >
      <p class="settings__note settings__note--body">
        {{ t('settings.data.note') }}
      </p>

      <BaseButton
        variant="secondary"
        :loading="dataExport.busy.value"
        @click="dataExport.run()"
      >
        {{ t('settings.data.download') }}
      </BaseButton>

      <p
        class="settings__saved"
        role="status"
        aria-live="polite"
      >
        <template v-if="dataExport.lastFileName.value">
          {{ t('settings.data.saved', { file: dataExport.lastFileName.value }) }}
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
