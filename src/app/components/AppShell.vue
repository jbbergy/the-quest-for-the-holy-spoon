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
import { ROUTE } from '@/app/router'

const route = useRoute()
const announcement = ref('')
const main = ref<HTMLElement | null>(null)

/**
 * Libellés courts : la barre doit tenir sur quatre colonnes à 320 px de large.
 * « Tableau de bord » y passait sur deux lignes et désalignait toute la rangée.
 */
const LINKS = [
  { name: ROUTE.dashboard, label: 'Accueil', icon: '◎' },
  { name: ROUTE.mealBuilder, label: 'Repas', icon: '＋' },
  { name: ROUTE.journal, label: 'Journal', icon: '☰' },
  { name: ROUTE.settings, label: 'Réglages', icon: '⚙' },
] as const

/** La coquille disparaît pendant l'accueil et l'onboarding, qui sont plein écran. */
const BARE_ROUTES: readonly string[] = [ROUTE.splash, ROUTE.auth, ROUTE.profileSetup]
const isBare = computed(() => BARE_ROUTES.includes(String(route.name)))

watch(
  () => route.name,
  async (name, previous) => {
    const link = LINKS.find((entry) => entry.name === name)
    announcement.value = link === undefined ? '' : `${link.label} — page chargée`

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

    await nextTick()
    main.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <div class="shell">
    <a
      class="skip-link"
      href="#contenu"
    >Aller au contenu</a>

    <p
      class="sr-only"
      aria-live="polite"
      role="status"
    >
      {{ announcement }}
    </p>

    <main
      id="contenu"
      ref="main"
      class="shell__main"
      :class="{ 'shell__main--bare': isBare }"
      tabindex="-1"
    >
      <slot />
    </main>

    <ServiceWorkerNotice />

    <nav
      v-if="!isBare"
      class="shell__nav"
      aria-label="Navigation principale"
    >
      <RouterLink
        v-for="link in LINKS"
        :key="link.name"
        class="shell__link touch-target"
        :to="{ name: link.name }"
        :aria-current="route.name === link.name ? 'page' : undefined"
      >
        <span
          class="shell__icon"
          aria-hidden="true"
        >{{ link.icon }}</span>
        <span class="shell__label">{{ link.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped lang="scss">
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.shell__main {
  flex: 1;
  width: 100%;
  max-width: var(--layout-max-width);

  /* La marge basse réserve la place de la barre de navigation, y compris la zone
     sûre des téléphones à encoche. */
  margin: 0 auto;
  padding: var(--space-5) var(--space-4)
    calc(var(--space-8) + env(safe-area-inset-bottom, 0px) + 3.5rem);
}

.shell__main--bare {
  padding-bottom: var(--space-5);
}

.shell__main:focus {
  /* Le lien d'évitement déplace le focus ici ; l'anneau serait du bruit visuel
     sur une région entière, et le repère est donné par le défilement. */
  outline: none;
}

.shell__nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
  background: color-mix(in srgb, var(--color-surface-raised) 92%, transparent);
  border-top: 1px solid var(--color-border);
  backdrop-filter: blur(12px);
}

.shell__link {
  display: flex;
  flex: 1;
  max-width: 7rem;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-decoration: none;
  white-space: nowrap;
}

.shell__link[aria-current='page'] {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 700;
}

.shell__icon {
  font-size: var(--font-size-lg);
  line-height: 1;
}
</style>
