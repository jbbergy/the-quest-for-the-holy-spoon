/**
 * Port d'envoi d'e-mails.
 *
 * Le serveur n'envoie que des messages transactionnels : confirmation d'adresse,
 * réinitialisation, invitation. Le fournisseur (SMTP, API) se choisit au
 * déploiement ; en développement, les liens s'affichent dans la console.
 */
export interface OutgoingMail {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export interface IMailer {
  send(mail: OutgoingMail): Promise<void>
}

/** Développement : le message s'affiche dans le terminal du serveur. */
export class ConsoleMailer implements IMailer {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}

  async send(mail: OutgoingMail): Promise<void> {
    this.write(
      [
        '',
        '─── E-mail (développement) ─────────────────────────────',
        `À      : ${mail.to}`,
        `Objet  : ${mail.subject}`,
        '',
        mail.text,
        '────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
  }
}
