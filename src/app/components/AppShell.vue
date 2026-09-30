<script setup lang="ts">
/**
 * Coquille de navigation.
 *
 * Elle porte le lien d'évitement (critère 2.4.1), les points de repère
 * sémantiques (`nav`, `main`) et l'annonce des changements de page. Une
 * application monopage ne recharge pas le document : sans région discrète, un
 * lecteur d'écran reste muet après une navigation, ce que le critère 4.1.3
 * demande de corriger.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ServiceWorkerNotice from '@/app/components/ServiceWorkerNotice.vue'
import SyncIndicator from '@/app/components/SyncIndicator.vue'
import { initials } from '@/app/initials'
import { ACCOUNT_ROUTES, ROUTE } from '@/app/router'
import { pageTitle } from '@/app/pageTitle'
import { useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import AppIcon from '@/ui/AppIcon.vue'
import type { IconName } from '@/ui/icons'

const route = useRoute()
const account = useAccountStore()
const players = usePlayerStore()
/**
 * Les invitations sont lues dès l'ouverture de session : une personne qui
 * vient de créer son compte depuis un e-mail d'invitation doit la voir
 * signalée sans avoir à deviner où chercher.
 */
const household = useHousehold()
const announcement = ref('')
const main = ref<HTMLElement | null>(null)

/**
 * Libellés courts : « Tableau de bord » passait sur deux lignes à 320 px de
 * large et désalignait toute la rangée.
 *
 * Plus d'entrée « Journal » : la semaine montre aussi les jours passés, et deux
 * écrans qui modifient les mêmes repas compliquaient l'usage plus qu'ils ne
 * l'aidaient.
 *
 * Les réglages ne sont plus un onglet : on y va rarement, et leur place
 * servait mieux au garde-manger, où l'on retourne souvent. Ils s'ouvrent
 * depuis le bouton à l'avatar, en haut de chaque écran.
 */
interface Destination {
  readonly name: string
  /** Écrans qui en dépendent : le lien reste allumé quand on y est. */
  readonly also: readonly string[]
}

interface NavLink extends Destination {
  readonly label: string
  readonly icon: IconName
}

const HOME: NavLink = { name: ROUTE.dashboard, label: 'shell.nav.home', icon: 'today', also: [] }
const WEEK: NavLink = {
  name: ROUTE.weekPlan,
  label: 'shell.nav.week',
  icon: 'week',
  also: [ROUTE.mealEditor, ROUTE.shoppingList],
}
const PANTRY: NavLink = {
  name: ROUTE.foods,
  label: 'shell.nav.pantry',
  icon: 'pantry',
  also: [ROUTE.foodDetail, ROUTE.foodEdit, ROUTE.customFood, ROUTE.recipes, ROUTE.recipeDetail],
}
const HOUSEHOLD: NavLink = {
  name: ROUTE.household,
  label: 'shell.nav.household',
  icon: 'household',
  also: [ROUTE.invitation, ROUTE.memberDay],
}
const SETTINGS: Destination = { name: ROUTE.settings, also: [ROUTE.profileEdit, ROUTE.calculations] }

/** Le foyer n'existe qu'avec un compte : sans session, l'onglet n'aurait rien à montrer. */
const links = computed<readonly NavLink[]>(() =>
  account.isSignedIn ? [HOME, WEEK, PANTRY, HOUSEHOLD] : [HOME, WEEK, PANTRY],
)

/** Pastille du bouton des réglages : les initiales de la personne. */
const avatar = computed(() => initials(players.player?.name ?? ''))

const pendingInvitations = computed(() =>
  household.household === null ? household.invitations.length : 0,
)

/**
 * `page` pour l'écran lui-même, `true` pour un écran qui en dépend : l'éditeur
 * d'un repas appartient à la semaine, et l'onglet doit rester allumé sans
 * prétendre au lecteur d'écran que c'est la même page.
 */
function currentness(link: Destination): 'page' | 'true' | undefined {
  if (route.name === link.name) return 'page'
  return link.also.includes(String(route.name)) ? 'true' : undefined
}

/**
 * La coquille disparaît pendant l'accueil, l'onboarding et les écrans de
 * compte, qui sont plein écran.
 */
const BARE_ROUTES: readonly string[] = [
  ROUTE.splash,
  ROUTE.auth,
  ROUTE.profileSetup,
  ...ACCOUNT_ROUTES,
]
const isBare = computed(() => BARE_ROUTES.includes(String(route.name)))

/**
 * Annonce l'écran atteint, **quel qu'il soit** : un repas, une fiche
 * d'aliment ou une invitation ne sont pas moins des pages que les onglets.
 * Le titre est lu après le rendu, une fois que l'écran a pu le préciser
 * (`usePageTitle`) ; vidé d'abord, pour qu'un même titre soit redit.
 */
watch(
  () => route.name,
  async (_name, previous) => {
    announcement.value = ''
    await nextTick()
    announcement.value = pageTitle.value === '' ? '' : t('shell.pageShown', { title: pageTitle.value })

    /**
     * Replace le focus au début du contenu après une navigation **de
     * l'utilisateur**.
     *
     * Une application monopage ne recharge pas le document : sans ce geste, le
     * focus resterait sur le lien de navigation qui vient d'être activé, et la
     * tabulation reprendrait depuis le bas de l'écran, au milieu d'une page
     * jamais parcourue. C'est l'emploi prévu du `tabindex="-1"` porté par
     * `<main>`.
     *
     * La redirection initiale depuis l'écran d'accueil en est exclue : ce n'est
     * pas l'utilisateur qui navigue, et y déplacer le focus placerait le lien
     * d'évitement derrière lui — donc hors d'atteinte — dès l'arrivée sur
     * l'application.
     */
    if (previous === undefined || previous === ROUTE.splash) return

    main.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <div
    class="shell"
    :class="{ 'shell--bare': isBare }"
  >
    <a
      class="skip-link"
      href="#contenu"
    >{{ t('shell.skipLink') }}</a>

    <p
      class="sr-only"
      aria-live="polite"
      role="status"
    >
      {{ announcement }}
    </p>

    <!-- Téléphone : barre d'onglets en bas. Grand écran : colonne à gauche,
         avec le nom de l'application et le bouton des réglages. -->
    <div
      v-if="!isBare"
      class="shell__side"
    >
      <p
        class="shell__brand"
        aria-hidden="true"
      >
        {{ t('shell.brand') }}
      </p>

      <nav
        class="shell__nav"
        :aria-label="t('shell.nav.label')"
      >
        <ul class="shell__links">
          <li
            v-for="link in links"
            :key="link.name"
          >
            <RouterLink
              class="shell__link"
              :to="{ name: link.name }"
              :aria-current="currentness(link)"
            >
              <span class="shell__icon">
                <AppIcon
                  :name="link.icon"
                  :size="1.375"
                />
              </span>
              <span class="shell__label">{{ t(link.label) }}</span>
              <span
                v-if="link === HOUSEHOLD && pendingInvitations > 0"
                class="shell__badge"
              >
                <span aria-hidden="true">{{ pendingInvitations }}</span>
                <span class="sr-only">
                  {{ t('shell.nav.pendingInvitations', { n: pendingInvitations }) }}
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </nav>

      <RouterLink
        class="shell__settings shell__settings--side"
        :to="{ name: ROUTE.settings }"
        :aria-current="currentness(SETTINGS)"
      >
        <span
          class="shell__avatar"
          aria-hidden="true"
        >{{ avatar }}</span>
        {{ t('shell.nav.settings') }}
      </RouterLink>
    </div>

    <header
      v-if="!isBare"
      class="shell__top"
      :class="{ 'shell__top--wide': route.meta.wide === true }"
    >
      <SyncIndicator class="shell__sync" />
      <RouterLink
        class="shell__settings shell__settings--top"
        :to="{ name: ROUTE.settings }"
        :aria-current="currentness(SETTINGS)"
      >
        <span
          class="shell__avatar"
          aria-hidden="true"
        >{{ avatar }}</span>
        {{ t('shell.nav.settings') }}
      </RouterLink>
    </header>

    <main
      id="contenu"
      ref="main"
      class="shell__main"
      :class="{ 'shell__main--bare': isBare, 'shell__main--wide': route.meta.wide === true }"
      tabindex="-1"
    >
      <slot />
    </main>

    <ServiceWorkerNotice />
  </div>
</template>

<style scoped lang="scss">
/* Au-delà de cette largeur, la barre d'onglets devient une colonne. */
$wide: 64rem;

.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.shell__top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  width: 100%;
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--space-4) var(--space-4) 0;
}

.shell__top .shell__sync {
  margin-right: auto;
  padding: 0;
}

.shell__main {
  flex: 1;
  width: 100%;
  max-width: var(--layout-max-width);

  /* La marge basse réserve la place de la barre de navigation, y compris la zone
     sûre des téléphones à encoche. */
  margin: 0 auto;
  padding: var(--space-3) var(--space-4)
    calc(var(--space-8) + env(safe-area-inset-bottom, 0px) + 4rem);
}

.shell__main--bare {
  padding-top: var(--space-5);
  padding-bottom: var(--space-5);
}

.shell__main:focus {
  /* Le lien d'évitement déplace le focus ici ; l'anneau serait du bruit visuel
     sur une région entière, et le repère est donné par le défilement. */
  outline: none;
}

/* Sur téléphone, la colonne n'existe pas : ses enfants se placent seuls. */
.shell__side {
  display: contents;
}

.shell__brand,
.shell__side .shell__settings--side {
  display: none;
}

.shell__nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
  background: var(--color-surface-raised);
  border-top: 1px solid var(--color-border);
}

.shell__links {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: var(--space-1);
  max-width: 32rem;
  margin: 0 auto;
}

.shell__link {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-height: 3.5rem;
  padding: var(--space-1) 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
}

.shell__link:hover {
  color: var(--color-text);
}

/* La pastille de l'onglet actif : fond teinté **et** texte en gras, pour que
   l'état ne repose pas sur la seule couleur (critère 1.4.1). */
.shell__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 2rem;
  border-radius: var(--radius-pill);
}

.shell__link[aria-current] {
  color: var(--color-accent);
  font-weight: 700;
}

.shell__link[aria-current] .shell__icon {
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.shell__badge {
  position: absolute;
  top: 0;
  left: calc(50% + 0.6rem);
  min-width: 1.25rem;
  padding: 0 0.35rem;
  border-radius: var(--radius-pill);
  background: var(--color-accent);
  color: var(--color-accent-contrast);
  font-size: var(--font-size-xs);
  font-weight: 700;
  line-height: 1.25rem;
  text-align: center;
}

/* Bouton des réglages : pastille d'initiales et mot écrit, jamais l'avatar
   seul — une photo ou des lettres ne disent pas où mène le bouton. */
.shell__settings {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-4) 0 6px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 700;
  text-decoration: none;
}

.shell__settings:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.shell__settings[aria-current] {
  border-color: var(--color-accent);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}

.shell__avatar {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-inverse);
  color: var(--color-on-inverse);
  font-size: var(--font-size-xs);
  font-weight: 700;
  line-height: 1;
}

@media (min-width: $wide) {
  .shell:not(.shell--bare) {
    display: grid;
    grid-template-columns: 15.5rem minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .shell__side {
    position: sticky;
    top: 0;
    grid-row: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    height: 100dvh;
    padding: var(--space-6) var(--space-4);
    background: var(--color-surface-raised);
    border-right: 1px solid var(--color-border);
  }

  .shell__brand {
    display: block;
    margin: 0 var(--space-3);
    font-family: var(--font-display);
    font-size: var(--font-size-xl);
    line-height: 1.1;
  }

  .shell__nav {
    position: static;
    padding: 0;
    background: none;
    border: none;
  }

  .shell__links {
    grid-auto-flow: row;
    max-width: none;
  }

  .shell__link {
    flex-direction: row;
    gap: var(--space-3);
    min-height: 3.25rem;
    padding: 0 var(--space-3);
    font-size: var(--font-size-md);
    text-align: left;
  }

  .shell__icon {
    width: 2rem;
  }

  .shell__badge {
    position: static;
    margin-left: auto;
  }

  .shell__side .shell__settings--side {
    display: inline-flex;
    margin-top: auto;
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
  }

  .shell__top .shell__settings--top {
    display: none;
  }

  .shell__top,
  .shell__main {
    max-width: calc(var(--layout-max-width) + 2 * var(--space-8));
    padding-inline: var(--space-8);
  }

  .shell__top {
    padding-top: var(--space-5);
  }

  .shell__main {
    padding-bottom: var(--space-8);
  }

  .shell__top--wide,
  .shell__main--wide {
    max-width: 84rem;
  }
}
</style>
