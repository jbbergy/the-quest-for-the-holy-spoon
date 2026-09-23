import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Architecture du serveur, rendue exécutable — le pendant de
 * `src/core/__tests__/architecture.test.ts`.
 *
 * Le serveur suit les mêmes couches que le client : domaine et use cases en
 * TypeScript pur, adaptateurs (Kysely, argon2, Fastify) à la périphérie. Il
 * partage avec le client le noyau (`src/core`), le contrat HTTP
 * (`src/contract`) et le domaine du **même** contexte — jamais la présentation,
 * jamais l'infrastructure navigateur.
 */
const SERVER_SRC = fileURLToPath(new URL('..', import.meta.url))
const MODULES_DIR = join(SERVER_SRC, 'modules')

/** Paquets d'infrastructure : interdits au domaine et aux use cases. */
const INFRASTRUCTURE_PACKAGES = [
  'fastify',
  '@fastify/',
  'kysely',
  'pg',
  '@electric-sql/',
  '@node-rs/',
  'zod',
  'node:',
]

const IMPORT_PATTERN = /(?:from|import)\s+['"]([^'"]+)['"]/g

function tsFilesIn(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : tsFilesIn(full)
    return entry.endsWith('.ts') ? [full] : []
  })
}

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map((match) => match[1]!)

const label = (file: string): string => relative(SERVER_SRC, file)

const serverModules = readdirSync(MODULES_DIR)
const allFiles = tsFilesIn(SERVER_SRC)

describe('Architecture du serveur', () => {
  it('trouve bien les fichiers à contrôler', () => {
    expect(serverModules).toContain('account')
    expect(allFiles.length).toBeGreaterThan(10)
  })

  it.each(
    serverModules.flatMap((module) =>
      ['domain', 'application'].flatMap((layer) =>
        tsFilesIn(join(MODULES_DIR, module, layer)).map((file) => [label(file), file]),
      ),
    ),
  )('%s ignore toute technologie', (_label, file) => {
    const offending = importsOf(file).filter((specifier) =>
      INFRASTRUCTURE_PACKAGES.some((banned) =>
        banned.endsWith('/') || banned.endsWith(':')
          ? specifier.startsWith(banned)
          : specifier === banned || specifier.startsWith(`${banned}/`),
      ),
    )
    expect(offending).toEqual([])
  })

  it.each(
    serverModules.flatMap((module) =>
      ['domain', 'application'].flatMap((layer) =>
        tsFilesIn(join(MODULES_DIR, module, layer)).map((file) => [label(file), file]),
      ),
    ),
  )('%s ne dépend ni des adaptateurs ni du socle technique', (_label, file) => {
    const offending = importsOf(file).filter(
      (specifier) =>
        specifier.includes('/infrastructure') ||
        specifier.includes('/http') ||
        specifier.includes('shared/'),
    )
    expect(offending).toEqual([])
  })

  it.each(allFiles.map((file) => [label(file), file]))(
    '%s n’emprunte au client que le noyau, le contrat et le domaine de son contexte',
    (fileLabel, file) => {
      const ownModule = /^modules\/([a-z_]+)\//.exec(fileLabel)?.[1]

      const offending = importsOf(file)
        .filter((specifier) => specifier.startsWith('@/'))
        .filter((specifier) => {
          if (specifier.startsWith('@/core/infrastructure')) return true
          if (specifier.startsWith('@/core/') || specifier.startsWith('@/contract/')) return false
          const match = /^@\/modules\/([a-z_]+)\/domain\//.exec(specifier)
          return match === null || match[1] !== ownModule
        })
      expect(offending).toEqual([])
    },
  )
})
