import { fileURLToPath } from 'node:url'

/**
 * Configuration du serveur, lue une fois au démarrage.
 *
 * Tout a une valeur par défaut adaptée au développement : `npm run dev:all` doit
 * fonctionner sans fichier `.env`. En production, `NODE_ENV=production` rend les
 * cookies `Secure` et exige `APP_URL`.
 */
export interface ServerConfig {
  readonly host: string
  readonly port: number
  /** Postgres de production. Absent : PGlite sur disque, dans `dataDir`. */
  readonly databaseUrl: string | undefined
  readonly dataDir: string
  /** Adresse publique de l'application, pour les liens des e-mails. */
  readonly appUrl: string
  /** Origines autorisées à appeler l'API avec une mutation (anti-CSRF). */
  readonly allowedOrigins: readonly string[]
  readonly secureCookies: boolean
  /** Derrière un reverse proxy : lire l'IP cliente dans `X-Forwarded-For`. */
  readonly trustProxy: boolean
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4318', 'http://localhost:4173']

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production'
  const appUrl = env.APP_URL ?? (production ? undefined : DEV_ORIGINS[0])
  if (appUrl === undefined) throw new Error('APP_URL est obligatoire en production.')

  return {
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: Number(env.PORT ?? 4319),
    databaseUrl: env.DATABASE_URL,
    dataDir: env.DATA_DIR ?? fileURLToPath(new URL('../../.data/pglite', import.meta.url)),
    appUrl,
    allowedOrigins: (env.ALLOWED_ORIGINS?.split(',') ?? (production ? [appUrl] : DEV_ORIGINS))
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
    secureCookies: production,
    trustProxy: env.TRUST_PROXY === 'true',
  }
}
