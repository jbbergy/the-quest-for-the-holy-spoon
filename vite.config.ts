/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Teinte de la barre système : le fond du thème clair par défaut (« Aube »). */
const THEME_COLOR = '#fbfaf7'

/**
 * Configuration de la PWA.
 *
 * `registerType: 'prompt'` est un choix délibéré contre `autoUpdate` : ce
 * dernier recharge la page dès qu'une nouvelle version prend la main, ce qui
 * peut survenir au milieu de la composition d'un repas. Ici, la mise à jour est
 * proposée et c'est l'utilisateur qui décide du moment.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  manifest: {
    name: 'The Quest for the Holy Spoon',
    short_name: 'Holy Spoon',
    description: 'Apprendre à manger équilibré, une quête à la fois.',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ['health', 'food', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Une icône `maskable` séparée : Android rogne jusqu'à 20 % du bord, et
      // réutiliser l'icône pleine amputerait le manche de la cuillère.
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    /**
     * Le `.json` de cette liste vise `data/ciqual.json` (≈ 630 Ko).
     *
     * Le précacher coûte un téléchargement à l'installation, mais c'est ce qui
     * rend vraie la promesse hors-ligne : sans lui, un premier lancement sans
     * réseau afficherait une application vide, faute de catalogue à amorcer.
     */
    globPatterns: ['**/*.{js,css,html,svg,png,ico,json,webmanifest}'],
    /*
     * Pas d'`includeAssets` : le favicon, l'icône SVG et l'icône Apple sont déjà
     * couverts par les motifs ci-dessus, et les y répéter dupliquait leur entrée
     * de précache. Le manifeste et les icônes qu'il déclare restent, eux, ajoutés
     * une seconde fois par le plugin lui-même ; les révisions étant identiques,
     * Workbox les dédoublonne à l'installation sans conflit.
     */
    /** Les routes de l'application sont côté client : toute navigation retombe sur la coquille. */
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/data\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        /**
         * Open Food Facts reste en réseau d'abord : une fiche produit peut être
         * corrigée en amont, et une donnée nutritionnelle périmée vaut moins
         * qu'un aller-retour. Le cache n'est qu'un filet — il fait qu'un produit
         * déjà scanné reste consultable dans le métro.
         */
        // `/api/` pour la lecture par code-barres, `/cgi/search.pl` pour la
        // recherche par nom : restreindre à `/api/` laissait la seconde
        // entièrement hors du cache.
        urlPattern: /^https:\/\/world\.openfoodfacts\.org\/(api|cgi)\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'open-food-facts',
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          // Volontairement sans le statut 0 : une réponse opaque masquerait un
          // échec et le figerait dans le cache pour un mois.
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
  // Le service worker reste hors du serveur de développement : il servirait des
  // fichiers en cache et masquerait les modifications en cours.
  devOptions: { enabled: false },
  /**
   * Vitest charge cette configuration. Laisser le plugin actif y ferait émettre
   * un service worker et un module virtuel à chaque exécution de la suite, pour
   * du code qu'aucun test n'exécute.
   */
  disable: process.env.VITEST === 'true',
})

// L'alias `@/` est défini ici une seule fois : Vite, Vitest et le typecheck
// (via tsconfig#paths) doivent rester alignés.
export default defineConfig({
  plugins: [vue(), pwa],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/core/**/*.ts',
        'src/modules/*/domain/**/*.ts',
        'src/modules/*/application/**/*.ts',
        'src/modules/*/infrastructure/**/*.ts',
        'src/modules/*/presentation/**/*.ts',
        'src/app/useDailyTracking.ts',
        'src/app/container.ts',
        'src/app/dataExport.ts',
        'src/app/useDataExport.ts',
        'src/app/download.ts',
        'src/app/pwa/serviceWorker.ts',
        'src/app/theme/**/*.ts',
        'src/ui/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/index.ts', '**/*.d.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
})
