/** Écrans de compte : connexion, création, e-mail, mot de passe. */
export const account = {
  form: {
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    newPassword: 'Nouveau mot de passe',
    passwordHint:
      'Au moins {min} caractères. Le plus simple : une petite phrase de quelques mots.',
    emailInvalid: 'Cette adresse e-mail n’est pas correcte. Par exemple : camille{\'@\'}exemple.fr',
    passwordTooShort: 'Ce mot de passe est trop court. Il faut au moins {min} caractères.',
    continueWithout: 'Continuer sans compte',
    backToSignIn: 'Retour à la connexion',
  },
  signIn: {
    title: 'Se connecter',
    submit: 'Se connecter',
    forgot: 'Mot de passe oublié ?',
    create: 'Créer un compte',
  },
  signUp: {
    title: 'Créer un compte',
    intro:
      'Avec un compte, vous retrouvez vos repas sur vos autres appareils. Vous pouvez aussi rejoindre un foyer.',
    submit: 'Créer mon compte',
    sentTitle: 'Regardez vos e-mails',
    sent: 'Nous venons d’envoyer un lien à {email}. Ouvrez-le pour confirmer votre adresse. Il marche pendant 24 heures. Regardez aussi dans les courriers indésirables.',
    existing: 'Cette adresse a déjà un compte ? Vous recevrez alors un e-mail pour vous connecter.',
    devNote: 'En développement, aucun e-mail ne part : le lien s’affiche dans le terminal du serveur.',
    changeAddress: 'Changer d’adresse',
    haveAccount: 'J’ai déjà un compte',
  },
  forgot: {
    title: 'Mot de passe oublié',
    intro:
      'Écrivez votre adresse e-mail. Vous recevrez un lien pour choisir un nouveau mot de passe.',
    submit: 'Recevoir le lien',
    sent: 'Si un compte existe avec l’adresse {email}, nous venons d’y envoyer un lien. Il marche pendant 1 heure. Regardez aussi dans les courriers indésirables.',
  },
  reset: {
    title: 'Nouveau mot de passe',
    incomplete:
      'Ce lien ne marche pas : il est incomplet. Ouvrez-le directement depuis l’e-mail, ou demandez un nouveau lien.',
    submit: 'Enregistrer et me connecter',
    askNewLink: 'Demander un nouveau lien',
  },
  verify: {
    title: 'Confirmation de l’adresse',
    pending: 'Confirmation en cours…',
    missing:
      'Ce lien ne marche pas : il est incomplet. Ouvrez-le directement depuis l’e-mail, sans le recopier.',
    done: 'Votre adresse est confirmée. Vous êtes connecté avec {email}.',
    createProfile: 'Créer mon profil',
    continue: 'Continuer',
    failedHelp:
      'Connectez-vous avec votre adresse et votre mot de passe : si l’adresse n’est toujours pas confirmée, un nouveau lien vous sera envoyé.',
    signIn: 'Se connecter',
  },
} as const
