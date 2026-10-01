<script setup lang="ts">
/**
 * Réglages d'affichage : l'heure où commence la journée, la langue, les
 * couleurs.
 *
 * La liste des thèmes est **générée** depuis les `theme.json` du dossier
 * `styles/themes/` — aucune énumération codée en dur ici. Changer de thème
 * applique le nouveau immédiatement, sans rechargement ni confirmation : c'est
 * un réglage dont l'effet est sa propre prévisualisation.
 */
import { computed } from 'vue'

import { DAY_START_HOURS } from '@/app/day/DayStartPreference'
import { useTodayStore } from '@/app/day/useTodayStore'
import { useThemeStore } from '@/app/theme/useThemeStore'
import { t, te } from '@/i18n'
import { AUTO_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locale'
import { useLocaleStore } from '@/i18n/useLocaleStore'
import AppIcon from '@/ui/AppIcon.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const theme = useThemeStore()
const locale = useLocaleStore()
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

function selectLocale(event: Event): void {
  locale.select((event.target as HTMLSelectElement).value as typeof locale.preference)
}
</script>

<template>
  <section
    class="list-group"
    aria-labelledby="affichage"
  >
    <h2
      id="affichage"
      class="eyebrow list-group__title"
    >
      {{ t('settings.display.title') }}
    </h2>
    <ErrorNotice :error="theme.error" />
    <div class="list-rows">
      <div class="list-row list-row--stacked">
        <label
          class="list-row__label"
          for="day-start"
        >{{ t('settings.dayStart.title') }}</label>
        <span class="list-row__select">
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
            class="list-row__chevron"
          />
        </span>
        <p
          id="day-start-hint"
          class="list-row__hint"
        >
          {{ t('settings.dayStart.hint') }}
        </p>
      </div>

      <div class="list-row list-row--stacked">
        <label
          class="list-row__label"
          for="locale"
        >{{ t('settings.language.title') }}</label>
        <span class="list-row__select">
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
            class="list-row__chevron"
          />
        </span>
        <p
          id="locale-hint"
          class="list-row__hint"
        >
          <template v-if="locale.preference === AUTO_LOCALE">
            {{ t('settings.language.autoHint', { language: deviceLanguage }) }}
          </template>
          {{ t('settings.language.subtitle') }}
        </p>
      </div>

      <fieldset class="list-row list-row--stacked themes">
        <legend class="list-row__label themes__legend">
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
</template>

<style scoped lang="scss">
/* Lignes de réglage : l'intitulé prend la place, l'explication passe dessous. */
.list-row__label {
  flex: 1 1 8rem;
}

.list-row__hint {
  flex-basis: 100%;
}

.list-row--stacked {
  padding-block: var(--space-3);
}

/* Liste déroulante native dans sa ligne : la valeur, puis un chevron. */
.list-row__select {
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

  .list-row__chevron {
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
</style>
