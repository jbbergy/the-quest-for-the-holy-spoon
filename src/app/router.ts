import { createRouter, createWebHistory, type Router } from 'vue-router'

import { APP_LINK } from '@/contract/account'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { useAccountSync } from './useAccountSync'

/**
 * Routes de l'application.
 *
 * Les vues sont chargées paresseusement : la PWA doit démarrer vite sur mobile,
 * et le `SplashScreen` ne doit pas attendre le code de la semaine pour s'afficher.
 */
export const ROUTE = {
  splash: 'splash',
  auth: 'auth',
  profileSetup: 'profile-setup',
  dashboard: 'dashboard',
  weekPlan: 'week-plan',
  mealEditor: 'meal-editor',
  foodSearch: 'food-search',
  customFood: 'custom-food',
  settings: 'settings',
  signIn: 'sign-in',
  signUp: 'sign-up',
  verifyEmail: 'verify-email',
  forgotPassword: 'forgot-password',
  resetPassword: 'reset-password',
} as const

/** Écrans de compte : plein écran, accessibles avec ou sans profil. */
export const ACCOUNT_ROUTES: readonly string[] = [
  ROUTE.signIn,
  ROUTE.signUp,
  ROUTE.verifyEmail,
  ROUTE.forgotPassword,
  ROUTE.resetPassword,
]

/** Routes accessibles sans profil : tout le reste exige l'onboarding. */
const PUBLIC_ROUTES: readonly string[] = [
  ROUTE.splash,
  ROUTE.auth,
  ROUTE.profileSetup,
  ...ACCOUNT_ROUTES,
]

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
        path: '/semaine',
        name: ROUTE.weekPlan,
        component: () => import('./views/WeekPlanView.vue'),
      },
      {
        // Sans identifiant : un nouveau repas, dont `?jour=` et `?type=` donnent
        // le jour et le type. `?aliment=` présélectionne un aliment à ajouter.
        path: '/semaine/repas/:mealId?',
        name: ROUTE.mealEditor,
        component: () => import('./views/MealEditorView.vue'),
      },
      // Anciennes adresses : une PWA installée peut en garder un raccourci.
      { path: '/repas', redirect: { name: ROUTE.weekPlan } },
      { path: '/journal', redirect: { name: ROUTE.weekPlan } },
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
      {
        path: '/reglages',
        name: ROUTE.settings,
        component: () => import('./views/SettingsView.vue'),
      },
      {
        path: '/connexion',
        name: ROUTE.signIn,
        component: () => import('./views/account/SignInView.vue'),
      },
      {
        path: '/inscription',
        name: ROUTE.signUp,
        component: () => import('./views/account/SignUpView.vue'),
      },
      // Chemins fixés par le contrat : ce sont ceux des liens envoyés par e-mail.
      {
        path: APP_LINK.verifyEmail,
        name: ROUTE.verifyEmail,
        component: () => import('./views/account/VerifyEmailView.vue'),
      },
      {
        path: '/mot-de-passe/oublie',
        name: ROUTE.forgotPassword,
        component: () => import('./views/account/ForgotPasswordView.vue'),
      },
      {
        path: APP_LINK.resetPassword,
        name: ROUTE.resetPassword,
        component: () => import('./views/account/ResetPasswordView.vue'),
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

    // La session est lue sans bloquer la navigation : le compte est facultatif,
    // et un serveur lent ou absent ne doit pas retarder l'ouverture de l'app.
    const account = useAccountStore()
    if (account.status === 'idle') {
      const { connect } = useAccountSync()
      void account.load().then(connect)
    }

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
