import { createTransport, type Transporter } from 'nodemailer'

import type { IMailer, OutgoingMail } from './Mailer'

/** Paramètres du relais SMTP (Brevo en production). */
export interface SmtpSettings {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly password: string
  /** Expéditeur affiché, par exemple `Holy Spoon <holyspoon@jibhey.fr>`. */
  readonly from: string
}

/**
 * Production : les messages partent par un relais SMTP authentifié.
 *
 * Une erreur d'envoi (clé expirée, relais injoignable) n'est pas avalée : elle
 * remonte jusqu'à la route, qui répond en erreur, et le journal de Fastify la
 * consigne. Un e-mail perdu sans trace serait bien plus difficile à diagnostiquer.
 */
export class SmtpMailer implements IMailer {
  private readonly transport: Transporter

  constructor(private readonly settings: SmtpSettings) {
    // `requireTLS` : sur le port 587, la connexion ne passe au chiffré qu'après
    // STARTTLS. Si ce passage échoue, on refuse d'envoyer plutôt que de
    // transmettre la clé en clair.
    this.transport = createTransport({
      host: settings.host,
      port: settings.port,
      requireTLS: true,
      auth: { user: settings.user, pass: settings.password },
    })
  }

  async send(mail: OutgoingMail): Promise<void> {
    await this.transport.sendMail({
      from: this.settings.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    })
  }
}
