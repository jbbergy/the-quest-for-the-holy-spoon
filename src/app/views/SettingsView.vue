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
 * L'affichage (`SettingsDisplay`) et le compte (`SettingsAccount`) ont leur
 * propre composant : chacun porte son état et ses actions.
 */
import { computed, defineAsyncComponent, ref } from 'vue'

import SettingsAccount from '@/app/components/settings/SettingsAccount.vue'
import SettingsDisplay from '@/app/components/settings/SettingsDisplay.vue'
import { GLOSSARY } from '@/app/glossary'
import { initials } from '@/app/initials'
import { ROUTE } from '@/app/router'
import { useHousehold } from '@/app/useHousehold'
import { numberFormat, t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'
import InfoTip from '@/ui/InfoTip.vue'
import RichText from '@/ui/RichText.vue'

/**
 * Panneau de données de démonstration, en développement seulement. Vite
 * remplace `import.meta.env.DEV` par une constante au build : en production,
 * la branche disparaît, et l'import dynamique avec elle.
 */
const DemoDataPanel = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/app/dev/DemoDataPanel.vue'))
  : null

const players = usePlayerStore()
const account = useAccountStore()
const household = useHousehold()

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)

const avatar = computed(() => initials(players.profileView?.name ?? ''))

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
      class="list-group"
      aria-labelledby="mes-besoins"
    >
      <h2
        id="mes-besoins"
        class="eyebrow list-group__title"
      >
        {{ t('settings.needs.title') }}
      </h2>
      <ul class="list-rows">
        <li class="list-row">
          <span class="list-row__label">
            {{ t('settings.needs.yourNeed') }}<InfoTip
              :term="t('labels.term.need')"
              :text="GLOSSARY.needs"
            />
          </span>
          <span class="list-row__value">{{ t('settings.needs.perDay', { kcal: kcal(players.profileView.targetCalories) }) }}</span>
        </li>
        <li class="list-row">
          <span class="list-row__label">
            {{ t('settings.needs.resting') }}<InfoTip
              :term="t('labels.term.restingEnergy')"
              :text="GLOSSARY.basalMetabolism"
            />
          </span>
          <span class="list-row__value">{{ t('settings.needs.perDay', { kcal: kcal(players.profileView.basalMetabolicRate) }) }}</span>
        </li>
        <li>
          <RouterLink
            class="list-row list-row--link"
            :to="{ name: ROUTE.calculations }"
          >
            <span class="list-row__label">{{ t('settings.calculations.open') }}</span>
            <AppIcon
              name="chevron-right"
              class="list-row__chevron"
            />
          </RouterLink>
        </li>
      </ul>
      <p class="list-group__note">
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

    <SettingsDisplay />

    <section
      v-if="account.session && household.household"
      class="list-group"
      aria-labelledby="foyer"
    >
      <h2
        id="foyer"
        class="eyebrow list-group__title"
      >
        {{ t('settings.household.title') }}
      </h2>
      <p class="list-group__note">
        {{ t('settings.household.subtitle', { name: household.household.name }) }}
      </p>
      <ErrorNotice :error="household.error" />
      <div class="list-rows">
        <label class="list-row switch-row">
          <span class="switch-row__text">
            <span class="list-row__label">{{ t('settings.household.share') }}</span>
            <span
              id="sharing-hint"
              class="list-row__hint"
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
        class="list-group__saved"
        role="status"
        aria-live="polite"
      >
        {{ sharingMessage }}
      </p>
    </section>

    <SettingsAccount />

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

.list-row__label {
  flex: 1 1 8rem;
}

.list-row__hint {
  flex-basis: 100%;
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

@media (forced-colors: active) {
  .switch::after {
    background: CanvasText;
  }
}
</style>
