import { mkdirSync } from 'node:fs'

import { buildApp } from './app'
import { configFromEnv } from './shared/config'
import { migrateToLatest, openDatabase } from './shared/db/database'
import { ConsoleMailer } from './shared/mail/Mailer'

/**
 * Point d'entrée du serveur.
 *
 * En développement (`npm run dev:all`), la base est un PGlite persistant dans
 * `server/.data/` et les e-mails s'affichent dans ce terminal : les liens de
 * confirmation s'y copient directement.
 */
const config = configFromEnv()

if (config.databaseUrl === undefined) mkdirSync(config.dataDir, { recursive: true })
const db = openDatabase(
  config.databaseUrl === undefined ? { dataDir: config.dataDir } : { url: config.databaseUrl },
)
await migrateToLatest(db)

// Le fournisseur SMTP sera branché au déploiement ; d'ici là, la console.
// En développement, seuls les avertissements s'affichent : le terminal reste
// lisible, et les liens des e-mails ne s'y noient pas.
const app = await buildApp({
  db,
  mailer: new ConsoleMailer(),
  config,
  logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
})

const shutdown = async (): Promise<void> => {
  await app.close()
  await db.destroy()
  process.exit(0)
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

await app.listen({ host: config.host, port: config.port })
console.log(`API prête sur http://${config.host}:${config.port}${config.databaseUrl === undefined ? ` — base PGlite : ${config.dataDir}` : ''}`)
