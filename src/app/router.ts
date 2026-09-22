import { createRouter, createWebHistory, type Router } from 'vue-router'

import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

/**
 * Routes de l'application.
 *
 * Les vues sont chargées paresseusement : la PWA doit démarrer vite sur mobile,
 * et le `SplashScreen` ne doit pas attendre le code du `Journal` pour s'afficher.
 */
export const ROUTE = {
  splash: 'splash',
  auth: 'auth',
  profileSetup: 'profile-setup',
  dashboard: 'dashboard',
  mealBuilder: 'meal-builder',
  foodSearch: 'food-search',
  customFood: 'custom-food',
  journal: 'journal',
  settings: 'settings',
} as const

/** Routes accessibles sans profil : tout le reste exige l'onboarding. */
const PUBLIC_ROUTES: readonly string[] = [ROUTE.splash, ROUTE.auth, ROUTE.profileSetup]

export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: ROUTE.splash, component: () => import('./views/SplashView.vue') },
      { path: '/auth', name: ROUTE.auth, component: () => import('./views/AuthView.vue') },
      {
        path: '/profil/creation',
        name: ROUTE.profileSetup,
        component: () => import('./views/ProfileSetupView.vue'),
      },
      {
        path: '/tableau-de-bord',
        name: ROUTE.dashboard,
        component: () => import('./views/DashboardView.vue'),
      },
      {
        path: '/repas',
        name: ROUTE.mealBuilder,
        component: () => import('./views/MealBuilderView.vue'),
      },
      {
        path: '/aliments',
        name: ROUTE.foodSearch,
        component: () => import('./views/FoodSearchView.vue'),
      },
      {
        path: '/aliments/nouveau',
        name: ROUTE.customFood,
        component: () => import('./views/CustomFoodView.vue'),
      },
      { path: '/journal', name: ROUTE.journal, component: () => import('./views/JournalView.vue') },
      {
        path: '/reglages',
        name: ROUTE.settings,
        component: () => import('./views/SettingsView.vue'),
      },
      { path: '/:pathMatch(.*)*', redirect: { name: ROUTE.splash } },
    ],
  })

  /**
   * Garde d'onboarding.
   *
   * Le profil est chargé une seule fois, à la première navigation : sans lui, le
   * tableau de bord n'aurait ni besoins caloriques ni identifiant de joueur, et
   * afficherait des jauges vides le temps d'un aller-retour. Une erreur de
   * chargement ne bloque pas la navigation — le store expose son état d'erreur,
   * et la vue décide quoi montrer.
   */
  router.beforeEach(async (to) => {
    const players = usePlayerStore()
    if (players.status === 'idle') await players.load()

    const needsProfile = !PUBLIC_ROUTES.includes(String(to.name))
    if (needsProfile && players.player === null) {
      return { name: ROUTE.profileSetup }
    }

    // Inutile de refaire l'onboarding quand le profil existe déjà.
    if (to.name === ROUTE.profileSetup && players.player !== null) {
      return { name: ROUTE.dashboard }
    }

    return true
  })

  return router
}
