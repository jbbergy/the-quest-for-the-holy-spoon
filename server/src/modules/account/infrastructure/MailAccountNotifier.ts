import { APP_LINK, LINK_TOKEN_PARAM } from '@/contract/account'
import type { Email } from '@/modules/account/domain/Email'

import type { IMailer } from '../../../shared/mail/Mailer'
import type { IAccountNotifier } from '../domain/ports'

import { alreadyRegisteredMail, resetPasswordMail, verifyEmailMail } from './mailTemplates'

/** Notifications du compte, envoyées par e-mail. */
export class MailAccountNotifier implements IAccountNotifier {
  constructor(private readonly mailer: IMailer) {}

  confirmAddress(to: Email, token: string, linkBase: string): Promise<void> {
    return this.mailer.send(verifyEmailMail(to.value, link(linkBase, APP_LINK.verifyEmail, token)))
  }

  alreadyRegistered(to: Email, resetToken: string, linkBase: string): Promise<void> {
    return this.mailer.send(
      alreadyRegisteredMail(to.value, link(linkBase, APP_LINK.resetPassword, resetToken)),
    )
  }

  resetPassword(to: Email, token: string, linkBase: string): Promise<void> {
    return this.mailer.send(resetPasswordMail(to.value, link(linkBase, APP_LINK.resetPassword, token)))
  }
}

function link(base: string, path: string, token: string): string {
  return `${base}${path}#${LINK_TOKEN_PARAM}=${token}`
}
