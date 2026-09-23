import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

import { buildApp } from '../app'
import { type Db, migrateToLatest, openDatabase } from '../shared/db/database'
import type { IMailer, OutgoingMail } from '../shared/mail/Mailer'

/** Mailer de test : garde les messages pour qu'on y lise les liens. */
export class RecordingMailer implements IMailer {
  readonly sent: OutgoingMail[] = []

  async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail)
  }

  /** Jeton du dernier lien envoyé à cette adresse. */
  lastTokenFor(to: string): string {
    const mail = this.sent.findLast((candidate) => candidate.to === to)
    const token = mail === undefined ? undefined : /#token=([\w-]+)/.exec(mail.text)?.[1]
    if (token === undefined) throw new Error(`Aucun lien envoyé à ${to}`)
    return token
  }
}

export const APP_ORIGIN = 'http://localhost:5173'

export interface TestServer {
  readonly app: FastifyInstance
  readonly db: Db
  readonly mailer: RecordingMailer
  /** Avance l'horloge du serveur. */
  advance(ms: number): void
  close(): Promise<void>
}

/** Une API complète sur une base PGlite neuve, en mémoire. */
export async function startTestServer(): Promise<TestServer> {
  const db = openDatabase()
  await migrateToLatest(db)

  const mailer = new RecordingMailer()
  let offset = 0
  const app = await buildApp({
    db,
    mailer,
    now: () => new Date(Date.now() + offset),
    config: {
      appUrl: APP_ORIGIN,
      allowedOrigins: [APP_ORIGIN],
      secureCookies: false,
      trustProxy: false,
    },
  })

  return {
    app,
    db,
    mailer,
    advance: (ms) => (offset += ms),
    async close() {
      await app.close()
      await db.destroy()
    },
  }
}

/**
 * Navigateur minimal : garde le cookie de session d'une réponse à l'autre,
 * comme le ferait Firefox, et envoie l'en-tête `Origin` de l'application.
 */
export class TestClient {
  private cookie: string | undefined

  constructor(private readonly app: FastifyInstance) {}

  get hasSession(): boolean {
    return this.cookie !== undefined
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ): Promise<LightMyRequestResponse> {
    const response = await this.app.inject({
      method,
      url: `/api${url}`,
      headers: {
        origin: APP_ORIGIN,
        ...(this.cookie === undefined ? {} : { cookie: `hs_session=${this.cookie}` }),
      },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })

    const session = response.cookies.find((cookie) => cookie.name === 'hs_session')
    if (session !== undefined) this.cookie = session.value === '' ? undefined : session.value
    return response
  }
}

/** Compte confirmé, connecté, et rattaché au profil donné. */
export async function signedInClient(
  server: TestServer,
  email: string,
  playerId: string,
): Promise<TestClient> {
  const client = new TestClient(server.app)
  await client.request('POST', '/auth/signup', { email, password: 'cuillère en bois dorée' })
  await client.request('POST', '/auth/verify', { token: server.mailer.lastTokenFor(email) })
  await client.request('PUT', '/auth/player', { playerId })
  return client
}
