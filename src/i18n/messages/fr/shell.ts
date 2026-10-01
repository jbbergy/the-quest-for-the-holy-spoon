/** Coquille de l'application : navigation, titres d'écran, synchronisation, mises à jour, accueil. */
export const shell = {
  skipLink: 'Aller au contenu',
  brand: 'Holy Spoon',
  pageShown: '{title}, page affichée',
  nav: {
    label: 'Navigation principale',
    // Césure conditionnelle (U+00AD) : la césure automatique de Firefox ne
    // sait pas couper ce mot, qui déborde de son onglet sur un écran étroit.
    home: 'Aujour\u00ADd’hui',
    week: 'Semaine',
    pantry: 'Garde-manger',
    household: 'Foyer',
    settings: 'Réglages',
    pendingInvitations: ', {n} invitation en attente | , {n} invitations en attente',
  },
  titles: {
    loading: 'Chargement',
    welcome: 'Bienvenue',
    profileSetup: 'Créer mon profil',
    home: 'Aujourd’hui',
    week: 'Semaine',
    meal: 'Repas',
    shoppingList: 'Liste de courses',
    foods: 'Mes aliments',
    createFood: 'Créer un aliment',
    food: 'Aliment',
    editFood: 'Modifier l’aliment',
    settings: 'Réglages',
    recipes: 'Mes recettes',
    recipe: 'Recette',
    calculations: 'Comment sont calculés mes repères',
    editProfile: 'Modifier mon profil',
    household: 'Foyer',
    invitation: 'Invitation',
    memberDay: 'Journée d’un membre',
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
    verifyEmail: 'Confirmer mon adresse',
    forgotPassword: 'Mot de passe oublié',
    resetPassword: 'Nouveau mot de passe',
    notFound: 'Page introuvable',
  },
  sync: {
    syncing: 'Envoi…',
    offline: 'Hors ligne',
    error: 'Non envoyé',
    saved: 'À jour',
    pendingShort: '{n} à envoyer',
    pending: '{n} changement à envoyer | {n} changements à envoyer',
    retrySpoken: 'réessayer l’envoi',
    offlineAnnouncement: 'Pas d’Internet. Vos changements partiront quand la connexion reviendra.',
    errorAnnouncement: 'L’envoi de vos changements n’a pas marché.',
    backOnline: 'Vos changements sont de nouveau envoyés.',
    retry: 'Réessayer',
  },
  update: {
    ready: 'Une nouvelle version de l’application est prête.',
    apply: 'Mettre à jour',
    later: 'Plus tard',
    offlineReady: 'L’application marche maintenant sans Internet.',
    close: 'Fermer',
  },
  onlineSearch: {
    unavailable:
      'La recherche des produits de marque ne répond pas. Elle est souvent surchargée. La liste montre seulement les aliments du catalogue public : il peut en manquer.',
    offline:
      'Vous n’êtes pas connecté à Internet. La liste montre seulement les aliments du catalogue public. Les produits de marque reviendront avec la connexion.',
    reconnected:
      'La connexion est revenue : les produits de marque peuvent de nouveau être cherchés.',
    barcodeHint:
      'Vous cherchez un produit de marque ? Essayez avec le numéro du code-barres : il passe par un autre service, qui répond presque toujours.',
    retry: 'Chercher de nouveau',
  },
  notFound: {
    title: 'Page introuvable',
    intro:
      'Cette adresse ne mène à aucun écran de l’application. Le lien est peut-être ancien, ou il a été coupé en le copiant.',
    home: 'Aller à l’accueil',
  },
  account: {
    otherOptions: 'Autres options',
  },
  splash: {
    loading: 'Chargement…',
  },
  welcome: {
    title: 'Bienvenue dans',
    intro:
      'Préparez vos repas de la semaine. Voyez ce que vous mangez chaque jour. Apprenez à manger équilibré.',
    resumeTitle: 'Reprendre',
    resumeSubtitle: 'Le profil de {name} est sur cet appareil.',
    resume: 'Continuer',
    startTitle: 'Commencer sans compte',
    startSubtitle: 'Vos données restent sur cet appareil.',
    start: 'Créer mon profil',
    accountTitle: 'Compte',
    signedInAs: 'Vous êtes connecté avec {email}.',
    withAccountTitle: 'Avec un compte',
    withAccountSubtitle:
      'Vous retrouvez vos repas sur vos autres appareils. Vous pouvez les partager avec votre foyer.',
    signIn: 'Se connecter',
    signUp: 'Créer un compte',
  },
} as const
