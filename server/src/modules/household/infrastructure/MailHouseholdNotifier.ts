import { HOUSEHOLD_APP_LINK } from '@/contract/household'
import type { Email } from '@/core/Email'

import type { IMailer, OutgoingMail } from '../../../shared/mail/Mailer'
import type { IHouseholdNotifier, InvitationNotice } from '../domain/ports'

const SIGNATURE = '— The Quest for the Holy Spoon'

/**
 * Texte brut, comme les e-mails du compte. Le message dit ce qui sera partagé
 * avant même qu'on ouvre l'application : c'est la première étape du
 * consentement, l'écran d'acceptation la seconde.
 */
export function invitationMail(to: string, notice: InvitationNotice, link: string): OutgoingMail {
  const until = notice.expiresAt.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  })
  return {
    to,
    subject: `Invitation à rejoindre le foyer « ${notice.householdName} »`,
    text: [
      'Bonjour,',
      '',
      `${notice.invitedBy.value} vous invite à rejoindre son foyer « ${notice.householdName} ».`,
      '',
      'Dans un foyer, chacun voit les repas et les jauges des autres membres, et peut partager ses aliments. Vos mensurations restent privées, et vous pourrez cesser de partager vos journées à tout moment.',
      '',
      `Pour répondre avant le ${until}, connectez-vous avec cette adresse — ou créez un compte avec elle si vous n’en avez pas :`,
      link,
      '',
      'Si vous ne connaissez pas cette personne, ignorez ce message : l’invitation expirera seule.',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}

export class MailHouseholdNotifier implements IHouseholdNotifier {
  constructor(private readonly mailer: IMailer) {}

  invited(to: Email, notice: InvitationNotice, linkBase: string): Promise<void> {
    return this.mailer.send(invitationMail(to.value, notice, `${linkBase}${HOUSEHOLD_APP_LINK}`))
  }
}
