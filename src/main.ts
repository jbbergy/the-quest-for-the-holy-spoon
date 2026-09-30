import { createPinia } from 'pinia'
import { createApp } from 'vue'

import './styles/main.scss'

import App from './App.vue'
import { createContainer } from './app/composition'
import { provideContainer } from './app/container'
import { registerServiceWorker } from './app/pwa/registerServiceWorker'
import { createServiceWorkerState, provideServiceWorkerState } from './app/pwa/serviceWorker'
import { createAppRouter } from './app/router'
import { startSyncTriggers } from './app/sync/triggers'
import { useTodayStore } from './app/day/useTodayStore'
import { useLocaleStore } from './i18n/useLocaleStore'
import { useThemeStore } from './app/theme/useThemeStore'

const container = createContainer()
provideContainer(container)

/**
 * Le service worker est enregistré **avant le montage**, mais n'affiche rien
 * par lui-même : il se contente de nourrir un état que `ServiceWorkerNotice`
 * observe. Une mise à jour disponible est donc proposée, jamais imposée.
 */
provideServiceWorkerState(createServiceWorkerState(registerServiceWorker))

const app = createApp(App)

/**
 * Filet de sécurité pour les erreurs **inattendues**.
 *
 * Les erreurs prévues voyagent en `Result` et sont dépliées par les stores ; ce
 * gestionnaire ne doit donc voir que de vrais bugs. C'est précisément pour cela
 * qu'il vaut la peine de les journaliser distinctement plutôt que de les noyer
 * dans le bruit.
 */
app.config.errorHandler = (error, _instance, info) => {
  console.error('[bug] erreur non gérée', { error, info })
}

const pinia = createPinia()
app.use(pinia)

/**
 * La langue aussi, avant le montage et pour la même raison que le thème : la
 * préférence est lue de façon synchrone, et le premier écran est peint une
 * seule fois, dans la bonne langue. Elle suit l'appareil tant qu'aucune langue
 * n'est choisie dans les réglages ; `languagechange` couvre le cas où l'appareil
 * en change alors que l'application est ouverte.
 */
const locale = useLocaleStore(pinia)
locale.initialize()
window.addEventListener('languagechange', () => locale.followDevice())

/**
 * Le thème est appliqué **avant le montage**.
 *
 * La préférence est lue de façon synchrone dans `localStorage` : la page est
 * donc peinte une seule fois, dans la bonne teinte. La différer après le montage
 * produirait un éclair clair chez tout utilisateur ayant choisi un thème sombre.
 */
useThemeStore(pinia).initialize()

// La journée en cours, à l'heure de début choisie : lue avant le premier rendu
// pour que l'accueil n'affiche pas la veille puis le jour, ou l'inverse.
useTodayStore(pinia).initialize()

app.use(createAppRouter())
app.mount('#app')

// Sans compte connecté, le moteur ignore ces déclencheurs.
startSyncTriggers(container.sync, container.network)

/**
 * Amorçage du catalogue, lancé après le montage.
 *
 * Le bloquer avant l'affichage retarderait le premier rendu de plusieurs
 * centaines de millisecondes pour une donnée dont seule la recherche a besoin.
 */
void container.seedCatalog().then((result) => {
  if (!result.ok) console.warn('[catalogue] amorçage incomplet', result.error)
})
