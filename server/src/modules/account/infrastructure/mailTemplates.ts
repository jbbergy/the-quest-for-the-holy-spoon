import type { OutgoingMail } from '../../../shared/mail/Mailer'

/**
 * Textes des e-mails.
 *
 * Texte brut seulement : lisible partout, y compris par un lecteur d'écran ou un
 * client mail minimal, et impossible à confondre avec un hameçonnage riche en
 * images. Chaque message dit ce qui se passera si on l'ignore.
 */
const SIGNATURE = '— The Quest for the Holy Spoon'

export function verifyEmailMail(to: string, link: string): OutgoingMail {
  return {
    to,
    subject: 'Confirmez votre adresse e-mail',
    text: [
      'Bonjour,',
      '',
      'Pour activer votre compte, ouvrez ce lien dans les 24 heures :',
      link,
      '',
      'Si vous n’avez pas créé de compte, ignorez ce message : sans confirmation, le compte reste inactif.',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}

export function alreadyRegisteredMail(to: string, resetLink: string): OutgoingMail {
  return {
    to,
    subject: 'Vous avez déjà un compte',
    text: [
      'Bonjour,',
      '',
      'Quelqu’un — sans doute vous — a tenté de créer un compte avec cette adresse, qui en a déjà un.',
      '',
      'Pour vous connecter, utilisez votre mot de passe habituel. Si vous l’avez oublié, choisissez-en un nouveau ici :',
      resetLink,
      '',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre compte n’a pas changé.',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}

export function resetPasswordMail(to: string, link: string): OutgoingMail {
  return {
    to,
    subject: 'Choisir un nouveau mot de passe',
    text: [
      'Bonjour,',
      '',
      'Pour choisir un nouveau mot de passe, ouvrez ce lien dans l’heure :',
      link,
      '',
      'Toutes vos sessions ouvertes seront fermées. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}
