<script setup lang="ts">
/**
 * Réglages : le profil, les besoins, l'affichage, le foyer, le compte et les
 * données.
 *
 * Une carte pour le profil, puis des groupes de lignes, chacun sous un
 * intitulé : on parcourt l'écran comme une liste, pas comme une pile de
 * cartes. Les réglages simples (heure, langue) sont des listes déroulantes
 * natives dans leur ligne ; le reste ouvre un autre écran ou agit sur place.
 *
 * Le profil ne se modifie pas ici : « Modifier » ouvre le même formulaire
 * qu'à la création — tout y est modifiable, pas seulement le poids.
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
import { initials } from '@/app/initials'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { useHousehold } from '@/app/useHousehold'
import { useDataExport } from '@/app/useDataExport'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { numberFormat, t, te } from '@/i18n'
import { AUTO_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locale'
import { useLocaleStore } from '@/i18n/useLocaleStore'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
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

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

const avatar = computed(() => initials(players.profileView?.name ?? ''))

function selectLocale(event: Event): void {
  locale.select((event.target as HTMLSelectElement).value as typeof locale.preference)
}

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

    <section
      v-if="players.profileView"
      class="profile"
      aria-labelledby="mon-profil"
    >
      <h2
        id="mon-profil"
        class="sr-only"
      >
        {{ t('settings.profile.title') }}
      </h2>
      <span
        class="profile__avatar"
        aria-hidden="true"
      >{{ avatar }}</span>
      <div class="profile__text">
        <p class="profile__name">
          {{ players.profileView.name }}
        </p>
        <p class="profile__need">
          {{ t('settings.profile.needLine', { kcal: kcal(players.profileView.targetCalories) }) }}
        </p>
      </div>
      <RouterLink
        class="profile__edit"
        :to="{ name: ROUTE.profileEdit }"
      >
        {{ t('settings.profile.editShort') }}<span class="sr-only">{{ t('settings.profile.editSpoken') }}</span>
      </RouterLink>
    </section>

    <section
      v-if="players.profileView"
      class="group"
      aria-labelledby="mes-besoins"
    >
      <h2
        id="mes-besoins"
        class="eyebrow group__title"
      >
        {{ t('settings.needs.title') }}
      </h2>
      <ul class="rows">
        <li class="row">
          <span class="row__label">
            {{ t('settings.needs.yourNeed') }}<InfoTip
              :term="t('labels.term.need')"
              :text="GLOSSARY.needs"
            />
          </span>
          <span class="row__value">{{ t('settings.needs.perDay', { kcal: kcal(players.profileView.targetCalories) }) }}</span>
        </li>
        <li class="row">
          <span class="row__label">
            {{ t('settings.needs.resting') }}<InfoTip
              :term="t('labels.term.restingEnergy')"
              :text="GLOSSARY.basalMetabolism"
            />
          </span>
          <span class="row__value">{{ t('settings.needs.perDay', { kcal: kcal(players.profileView.basalMetabolicRate) }) }}</span>
        </li>
        <li>
          <RouterLink
            class="row row--link"
            :to="{ name: ROUTE.calculations }"
          >
            <span class="row__label">{{ t('settings.calculations.open') }}</span>
            <AppIcon
              name="chevron-right"
              class="row__chevron"
            />
          </RouterLink>
        </li>
      </ul>
      <p class="group__note">
        <RichText path="settings.needs.note">
          <template #tip>
            <InfoTip
              :term="t('labels.term.howCalculated')"
              :text="GLOSSARY.formula"
            />
          </template>
        </RichText>
      </p>
    </section>

    <section
      class="group"
      aria-labelledby="affichage"
    >
      <h2
        id="affichage"
        class="eyebrow group__title"
      >
        {{ t('settings.display.title') }}
      </h2>
      <div class="rows">
        <div class="row row--stacked">
          <label
            class="row__label"
            for="day-start"
          >{{ t('settings.dayStart.title') }}</label>
          <span class="row__select">
            <select
              id="day-start"
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
            <AppIcon
              name="chevron-down"
              class="row__chevron"
            />
          </span>
          <p
            id="day-start-hint"
            class="row__hint"
          >
            {{ t('settings.dayStart.hint') }}
          </p>
        </div>

        <div class="row row--stacked">
          <label
            class="row__label"
            for="locale"
          >{{ t('settings.language.title') }}</label>
          <span class="row__select">
            <select
              id="locale"
              name="locale"
              aria-describedby="locale-hint"
              :value="locale.preference"
              @change="selectLocale"
            >
              <option
                v-for="choice in [AUTO_LOCALE, ...SUPPORTED_LOCALES]"
                :key="choice"
                :value="choice"
              >
                {{ choice === AUTO_LOCALE ? t('settings.language.auto') : t(`settings.language.${choice}`) }}
              </option>
            </select>
            <AppIcon
              name="chevron-down"
              class="row__chevron"
            />
          </span>
          <p
            id="locale-hint"
            class="row__hint"
          >
            <template v-if="locale.preference === AUTO_LOCALE">
              {{ t('settings.language.autoHint', { language: deviceLanguage }) }}
            </template>
            {{ t('settings.language.subtitle') }}
          </p>
        </div>

        <fieldset class="row row--stacked themes">
          <legend class="row__label themes__legend">
            {{ t('settings.colors.title') }}
          </legend>
          <div class="themes__choices">
            <label
              v-for="entry in theme.available"
              :key="entry.id"
              class="themes__choice"
            >
              <input
                type="radio"
                name="theme"
                :value="entry.id"
                :checked="theme.currentId === entry.id"
                :aria-describedby="`theme-${entry.id}`"
                @change="theme.select(entry.id)"
              >
              <span class="themes__card">
                <span
                  v-if="entry.preview"
                  class="themes__preview"
                  aria-hidden="true"
                  :style="{ background: entry.preview.background, borderColor: entry.preview.border }"
                >
                  <span
                    v-for="swatch in entry.preview.swatches"
                    :key="swatch"
                    class="themes__swatch"
                    :style="{ background: swatch }"
                  />
                </span>
                <span class="themes__name">{{ themeName(entry) }}</span>
              </span>
              <span
                :id="`theme-${entry.id}`"
                class="sr-only"
              >{{ themeDescription(entry) }}</span>
            </label>
          </div>
        </fieldset>
      </div>
    </section>

    <section
      v-if="account.session && household.household"
      class="group"
      aria-labelledby="foyer"
    >
      <h2
        id="foyer"
        class="eyebrow group__title"
      >
        {{ t('settings.household.title') }}
      </h2>
      <p class="group__note">
        {{ t('settings.household.subtitle', { name: household.household.name }) }}
      </p>
      <ErrorNotice :error="household.error" />
      <div class="rows">
        <label class="row switch-row">
          <span class="switch-row__text">
            <span class="row__label">{{ t('settings.household.share') }}</span>
            <span
              id="sharing-hint"
              class="row__hint"
            >{{ t('settings.household.shareHint') }}</span>
          </span>
          <input
            class="switch"
            type="checkbox"
            role="switch"
            :checked="household.household.sharesDays"
            aria-describedby="sharing-hint"
            @change="toggleSharing"
          >
        </label>
      </div>
      <p
        class="group__saved"
        role="status"
        aria-live="polite"
      >
        {{ sharingMessage }}
      </p>
    </section>

    <section
      class="group"
      aria-labelledby="compte-donnees"
    >
      <h2
        id="compte-donnees"
        class="eyebrow group__title"
      >
        {{ t('settings.accountData.title') }}
      </h2>
      <p class="group__note">
        <template v-if="account.session">
          {{ t('settings.account.signedInAs', { email: account.session.email }) }}
        </template>
        <template v-else-if="account.status === 'unreachable'">
          {{ t('settings.account.unreachable') }}
        </template>
        <RichText
          v-else
          path="settings.account.withAccount"
        >
          <template #household>
            {{ t('settings.account.householdWord') }}<InfoTip
              :term="t('settings.account.householdWord')"
              :text="GLOSSARY.household"
            />
          </template>
        </RichText>
      </p>

      <ErrorNotice :error="account.error" />
      <ErrorNotice :error="dataExport.error.value" />

      <div
        v-if="unsent !== null"
        class="group__warning"
        role="alert"
      >
        <p>
          {{ unsent === Infinity ? t('settings.account.unsentSome') : t('settings.account.unsent', { n: unsent }) }}
        </p>
        <p>{{ t('settings.account.loseThem') }}</p>
        <div class="group__actions">
          <BaseButton
            variant="danger-filled"
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

      <ul class="rows">
        <li>
          <button
            type="button"
            class="row row--link"
            :aria-busy="dataExport.busy.value ? 'true' : undefined"
            aria-describedby="data-note"
            @click="dataExport.run()"
          >
            <span class="row__label">{{ t('settings.data.download') }}</span>
            <AppIcon
              name="chevron-right"
              class="row__chevron"
            />
          </button>
        </li>

        <template v-if="account.session">
          <li>
            <button
              type="button"
              class="row row--link"
              :aria-busy="account.status === 'loading' ? 'true' : undefined"
              aria-describedby="sign-out-note"
              @click="signOut()"
            >
              <span class="row__label">{{ t('settings.account.signOut') }}</span>
            </button>
          </li>
          <li>
            <details class="danger">
              <summary class="row row--link danger__summary">
                <span class="row__label">{{ t('settings.account.deleteSummary') }}</span>
                <AppIcon
                  name="chevron-down"
                  class="row__chevron danger__chevron"
                />
              </summary>
              <form
                class="danger__form"
                novalidate
                @submit.prevent="deleteAccount"
              >
                <p class="row__hint">
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
                  variant="danger-filled"
                  :loading="account.status === 'loading'"
                >
                  {{ t('settings.account.deleteButton') }}
                </BaseButton>
              </form>
            </details>
          </li>
        </template>

        <li v-else-if="account.status === 'unreachable'">
          <button
            type="button"
            class="row row--link"
            @click="account.load()"
          >
            <span class="row__label">{{ t('settings.account.retry') }}</span>
          </button>
        </li>

        <template v-else>
          <li>
            <RouterLink
              class="row row--link"
              :to="{ name: ROUTE.signIn }"
            >
              <span class="row__label">{{ t('settings.account.signIn') }}</span>
              <AppIcon
                name="chevron-right"
                class="row__chevron"
              />
            </RouterLink>
          </li>
          <li>
            <RouterLink
              class="row row--link"
              :to="{ name: ROUTE.signUp }"
            >
              <span class="row__label">{{ t('settings.account.create') }}</span>
              <AppIcon
                name="chevron-right"
                class="row__chevron"
              />
            </RouterLink>
          </li>
        </template>
      </ul>

      <p
        id="data-note"
        class="group__note"
      >
        {{ t('settings.data.note') }}
      </p>
      <p
        v-if="account.session"
        id="sign-out-note"
        class="group__note"
      >
        {{ t('settings.account.signOutNote') }}
      </p>
      <p
        class="group__saved"
        role="status"
        aria-live="polite"
      >
        <template v-if="dataExport.lastFileName.value">
          {{ t('settings.data.saved', { file: dataExport.lastFileName.value }) }}
        </template>
        {{ accountMessage }}
      </p>
    </section>

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
  gap: var(--space-6);

  h1 {
    margin: 0;
  }
}

/* Le profil : une carte foncée, la pastille d'initiales sur fond safran. */
.profile {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3) var(--space-4);
  padding: var(--card-padding);
  background: var(--color-inverse);
  border-radius: var(--radius-xl);
  color: var(--color-on-inverse);
}

.profile__avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 3.75rem;
  height: 3.75rem;
  border-radius: 50%;
  background: var(--color-saffron);
  color: var(--color-on-saffron);
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.profile__text {
  flex: 1 1 6rem;
  min-width: 0;

  p {
    margin: 0;
  }
}

.profile__name {
  font-size: 1.125rem;
  font-weight: 700;
  overflow-wrap: break-word;
}

.profile__need {
  color: var(--color-on-inverse-muted);
  font-size: var(--font-size-sm);
}

.profile__edit {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--space-4);
  border: 2px solid var(--color-on-inverse);
  border-radius: var(--radius-pill);
  color: var(--color-on-inverse);
  font-size: var(--font-size-sm);
  text-decoration: none;

  &:hover {
    background: var(--color-on-inverse);
    color: var(--color-inverse);
  }

  &:focus-visible {
    outline-color: var(--color-on-inverse);
  }
}

/* Un groupe : son intitulé, puis une carte de lignes. */
.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.group__title {
  margin: 0 0 0 var(--space-1);
}

.group__note {
  margin: 0 var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.group__saved {
  min-height: 1.25rem;
  margin: 0 var(--space-1);
  color: var(--color-success);
  font-size: var(--font-size-sm);
  font-weight: 700;

  &:empty {
    display: none;
  }
}

.group__warning {
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-raised);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-md);

  p {
    margin: 0 0 var(--space-2);
  }
}

.group__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* Une ligne : l'intitulé à gauche, la valeur ou la flèche à droite. */
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-3);
  width: 100%;
  min-height: 3.5rem;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-weight: 400;
  text-align: left;
  text-decoration: none;
}

/* Après `.row`, qui retire toute bordure (boutons, fieldset) : le filet
   entre deux lignes l'emporte. */
.rows > * + * {
  border-top: 1px solid var(--color-divider);
}

.row--link {
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.row--stacked {
  padding-block: var(--space-3);
}

.row__label {
  flex: 1 1 8rem;
  min-width: 0;
}

.row__value {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.row__chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.row__hint {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Liste déroulante native dans sa ligne : la valeur, puis un chevron. */
.row__select {
  position: relative;
  display: inline-flex;
  align-items: center;

  select {
    min-height: 44px;
    padding: 0 calc(var(--space-2) + 1.25em) 0 var(--space-3);
    appearance: none;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .row__chevron {
    position: absolute;
    right: var(--space-2);
    pointer-events: none;
  }
}

/* Couleurs : trois cartes, chacune avec l'aperçu de son thème. */
.themes {
  display: block;
}

.themes__legend {
  float: left;
  width: 100%;
  margin-bottom: var(--space-3);
  padding: 0;
}

.themes__choices {
  clear: both;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: var(--space-2);
}

.themes__choice {
  position: relative;
  display: flex;

  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.themes__card {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}

.themes__preview {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  height: 2.75rem;
  padding: 6px;
  border: 1px solid;
  border-radius: 10px;
}

.themes__swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.themes__name {
  font-size: var(--font-size-sm);
  text-align: center;
  overflow-wrap: break-word;
}

/* Le thème choisi : bordure Feuille épaisse **et** nom en gras. */
.themes__choice input:checked + .themes__card {
  border: 2px solid var(--color-accent);
  padding: calc(var(--space-2) - 1px);

  .themes__name {
    font-weight: 700;
  }
}

.themes__choice input:focus-visible + .themes__card {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* Partager mes journées : un interrupteur natif (case à cocher, rôle switch). */
.switch-row {
  flex-wrap: nowrap;
  padding-block: var(--space-3);
  cursor: pointer;
}

.switch-row__text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.switch {
  position: relative;
  flex-shrink: 0;
  width: 3.5rem;
  height: 2rem;
  margin: 0;
  appearance: none;
  border: 2px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-track);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--color-border-strong);
    transition: transform var(--duration-fast) var(--ease-out);
  }

  &:checked {
    border-color: var(--color-accent);
    background: var(--color-accent);

    &::after {
      background: var(--color-accent-contrast);
      transform: translateX(1.5rem);
    }
  }
}

/* Supprimer mon compte : une ligne en Tomate qui s'ouvre sur le formulaire. */
.danger__summary {
  color: var(--color-danger);
  font-weight: 700;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  .row__chevron {
    color: var(--color-danger);
  }
}

.danger[open] .danger__chevron {
  transform: rotate(180deg);
}

.danger__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}

@media (forced-colors: active) {
  .switch::after {
    background: CanvasText;
  }
}
</style>
