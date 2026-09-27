import { createRouter, createWebHistory, type Router } from 'vue-router'

import { APP_LINK } from '@/contract/account'
import { HOUSEHOLD_APP_LINK } from '@/contract/household'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'

import { setPageTitle } from './pageTitle'
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
  shoppingList: 'shopping-list',
  foods: 'foods',
  foodDetail: 'food-detail',
  foodEdit: 'food-edit',
  customFood: 'custom-food',
  settings: 'settings',
  profileEdit: 'profile-edit',
  household: 'household',
  invitation: 'invitation',
  memberDay: 'member-day',
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

/**
 * Page où revenir après la connexion, passée en `?suite=`. Seul un chemin
 * interne est retenu : suivre une adresse quelconque ferait de l'écran de
 * connexion un tremplin vers un site tiers.
 */
export function returnPath(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : null
}

export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/',
        name: ROUTE.splash,
        meta: { title: 'Chargement' },
        component: () => import('./views/SplashView.vue'),
      },
      {
        path: '/auth',
        name: ROUTE.auth,
        meta: { title: 'Bienvenue' },
        component: () => import('./views/AuthView.vue'),
      },
      {
        path: '/profil/creation',
        name: ROUTE.profileSetup,
        meta: { title: 'Créer mon profil' },
        component: () => import('./views/ProfileSetupView.vue'),
      },
      {
        path: '/tableau-de-bord',
        name: ROUTE.dashboard,
        meta: { title: 'Accueil' },
        component: () => import('./views/DashboardView.vue'),
      },
      {
        path: '/semaine',
        name: ROUTE.weekPlan,
        meta: { title: 'Semaine' },
        component: () => import('./views/WeekPlanView.vue'),
      },
      {
        // Sans identifiant : un nouveau repas, dont `?jour=` et `?type=` donnent
        // le jour et le type. `?aliment=` présélectionne un aliment à ajouter.
        path: '/semaine/repas/:mealId?',
        name: ROUTE.mealEditor,
        meta: { title: 'Repas' },
        component: () => import('./views/MealEditorView.vue'),
      },
      {
        // `?semaine=` : un jour de la semaine voulue (son lundi, en pratique).
        path: '/semaine/courses',
        name: ROUTE.shoppingList,
        meta: { title: 'Liste de courses' },
        component: () => import('./views/ShoppingListView.vue'),
      },
      // Anciennes adresses : une PWA installée peut en garder un raccourci.
      { path: '/repas', redirect: { name: ROUTE.weekPlan } },
      { path: '/journal', redirect: { name: ROUTE.weekPlan } },
      {
        // Mes aliments, ouverts depuis les réglages. `?q=` : la recherche en cours.
        path: '/aliments',
        name: ROUTE.foods,
        meta: { title: 'Mes aliments' },
        component: () => import('./views/FoodCatalogView.vue'),
      },
      {
        // `?retour=` : l'éditeur de repas d'où l'on vient.
        path: '/aliments/nouveau',
        name: ROUTE.customFood,
        meta: { title: 'Créer un aliment' },
        component: () => import('./views/CustomFoodView.vue'),
      },
      {
        path: '/aliments/:foodId',
        name: ROUTE.foodDetail,
        meta: { title: 'Aliment' },
        component: () => import('./views/FoodDetailView.vue'),
      },
      {
        path: '/aliments/:foodId/modifier',
        name: ROUTE.foodEdit,
        meta: { title: 'Modifier l’aliment' },
        component: () => import('./views/CustomFoodView.vue'),
      },
      {
        path: '/reglages',
        name: ROUTE.settings,
        meta: { title: 'Réglages' },
        component: () => import('./views/SettingsView.vue'),
      },
      {
        path: '/reglages/profil',
        name: ROUTE.profileEdit,
        meta: { title: 'Modifier mon profil' },
        component: () => import('./views/ProfileEditView.vue'),
      },
      {
        // Chemin fixé par le contrat : c'est celui du lien de l'e-mail d'invitation.
        path: HOUSEHOLD_APP_LINK,
        name: ROUTE.household,
        meta: { title: 'Foyer' },
        component: () => import('./views/HouseholdView.vue'),
      },
      {
        path: `${HOUSEHOLD_APP_LINK}/invitations/:invitationId`,
        name: ROUTE.invitation,
        meta: { title: 'Invitation' },
        component: () => import('./views/InvitationView.vue'),
      },
      {
        // `?jour=AAAA-MM-JJ` : un jour passé ; aujourd'hui par défaut.
        path: `${HOUSEHOLD_APP_LINK}/membres/:playerId`,
        name: ROUTE.memberDay,
        meta: { title: 'Journée d’un membre' },
        component: () => import('./views/MemberDayView.vue'),
      },
      {
        path: '/connexion',
        name: ROUTE.signIn,
        meta: { title: 'Se connecter' },
        component: () => import('./views/account/SignInView.vue'),
      },
      {
        path: '/inscription',
        name: ROUTE.signUp,
        meta: { title: 'Créer un compte' },
        component: () => import('./views/account/SignUpView.vue'),
      },
      // Chemins fixés par le contrat : ce sont ceux des liens envoyés par e-mail.
      {
        path: APP_LINK.verifyEmail,
        name: ROUTE.verifyEmail,
        meta: { title: 'Confirmer mon adresse' },
        component: () => import('./views/account/VerifyEmailView.vue'),
      },
      {
        path: '/mot-de-passe/oublie',
        name: ROUTE.forgotPassword,
        meta: { title: 'Mot de passe oublié' },
        component: () => import('./views/account/ForgotPasswordView.vue'),
      },
      {
        path: APP_LINK.resetPassword,
        name: ROUTE.resetPassword,
        meta: { title: 'Nouveau mot de passe' },
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

  // Titre par défaut de chaque écran ; un écran peut le préciser ensuite.
  router.afterEach((to) => {
    setPageTitle(typeof to.meta.title === 'string' ? to.meta.title : '')
  })

  return router
}
