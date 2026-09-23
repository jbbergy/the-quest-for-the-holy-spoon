import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance } from 'fastify'

import { API_PREFIX } from '@/contract/http'

import { createServerContainer } from './composition'
import { SessionTransport } from './modules/account/http/authenticate'
import { registerAccountRoutes } from './modules/account/http/routes'
import { registerSyncRoutes } from './modules/sync/http/routes'
import type { ServerConfig } from './shared/config'
import type { Db } from './shared/db/database'
import { errorHandler } from './shared/http/errors'
import { originGuard } from './shared/http/origin'
import { RateLimiter } from './shared/http/rateLimit'
import type { IMailer } from './shared/mail/Mailer'

export interface AppDependencies {
  readonly db: Db
  readonly mailer: IMailer
  readonly config: Pick<ServerConfig, 'appUrl' | 'allowedOrigins' | 'secureCookies' | 'trustProxy'>
  readonly now?: () => Date
  /** Niveau de journalisation Fastify ; absent : aucun journal (tests). */
  readonly logLevel?: 'info' | 'warn' | 'error'
}

/**
 * Assemble l'API. Aucune ressource n'est ouverte ici : base, mailer et horloge
 * sont fournis, ce qui permet aux tests de monter une instance complète sur une
 * base PGlite en mémoire et d'avancer le temps à volonté.
 */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const clock = deps.now ?? (() => new Date())
  const container = createServerContainer({ db: deps.db, mailer: deps.mailer, clock })
  const sessions = new SessionTransport(container.account.authenticate, deps.config.secureCookies)

  const app = Fastify({
    logger: deps.logLevel === undefined ? false : { level: deps.logLevel },
    trustProxy: deps.config.trustProxy,
    // Les requêtes de l'application sont petites ; un corps volumineux ne peut
    // être qu'une erreur ou un abus.
    bodyLimit: 1_048_576,
  })

  await app.register(cookie)
  // `text/plain` est un type « simple » : un formulaire d'un autre site peut
  // l'envoyer sans pré-vérification CORS. L'API ne parle que JSON, et le dit
  // par un 415 plutôt que d'essayer d'interpréter le texte.
  app.removeContentTypeParser('text/plain')
  app.setErrorHandler(errorHandler)
  app.addHook('onRequest', originGuard(deps.config.allowedOrigins))

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ status: 'ok' }))

      registerAccountRoutes(api, {
        useCases: container.account,
        sessions,
        limiter: new RateLimiter(clock),
        appUrl: deps.config.appUrl,
        allowedOrigins: deps.config.allowedOrigins,
      })
      registerSyncRoutes(api, { useCases: container.sync, authenticator: sessions })
    },
    { prefix: API_PREFIX },
  )

  return app
}
