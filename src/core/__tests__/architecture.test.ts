import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Les règles d'architecture du projet, rendues exécutables.
 *
 * ESLint les exprime déjà, mais une règle qu'on peut désactiver d'un commentaire
 * n'est pas une garantie. Ce test lit le code source et échoue à la première
 * dérive — c'est la protection la moins coûteuse et la plus durable contre
 * l'érosion progressive des frontières.
 */
const SRC = fileURLToPath(new URL('../..', import.meta.url))
const MODULES = ['account', 'player_profile', 'nutrition_inventory', 'planning'] as const

const FORBIDDEN_IN_DOMAIN = ['vue', 'pinia', 'zod', 'idb', 'gsap', 'dexie'] as const

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
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : tsFilesIn(full)
    }
    return entry.endsWith('.ts') ? [full] : []
  })
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]!)
}

const domainFiles = MODULES.flatMap((module) => tsFilesIn(join(SRC, 'modules', module, 'domain')))
const coreFiles = tsFilesIn(join(SRC, 'core'))

describe('Architecture', () => {
  it('trouve bien les fichiers de domaine à contrôler', () => {
    // Garde-fou : si la structure change, le test ci-dessous ne doit pas passer
    // silencieusement en ne vérifiant rien.
    expect(domainFiles.length).toBeGreaterThanOrEqual(MODULES.length)
    expect(coreFiles.length).toBeGreaterThan(0)
  })

  it.each([...domainFiles, ...coreFiles].map((file) => [file.replace(SRC, 'src/'), file]))(
    '%s n’importe aucun framework ni technologie de stockage',
    (_label, file) => {
      const offending = importsOf(file).filter((specifier) =>
        FORBIDDEN_IN_DOMAIN.some(
          (banned) => specifier === banned || specifier.startsWith(`${banned}/`),
        ),
      )

      expect(offending).toEqual([])
    },
  )

  it.each(
    MODULES.flatMap((module) =>
      tsFilesIn(join(SRC, 'modules', module, 'domain')).map((file) => [
        file.replace(SRC, 'src/'),
        module,
        file,
      ]),
    ),
  )('%s ne référence aucun autre bounded context', (_label, module, file) => {
    const foreign = importsOf(file as string).filter((specifier) => {
      const match = /modules\/([a-z_]+)\//.exec(specifier)
      return match !== null && match[1] !== module
    })

    expect(foreign).toEqual([])
  })

  it.each(MODULES.map((module) => [module]))(
    '%s n’atteint les autres contextes que par leur façade application',
    (module) => {
      const files = ['application', 'infrastructure', 'presentation'].flatMap((layer) =>
        tsFilesIn(join(SRC, 'modules', module, layer)),
      )

      const violations = files.flatMap((file) =>
        importsOf(file)
          .filter((specifier) => {
            const match = /modules\/([a-z_]+)\/([a-z]+)/.exec(specifier)
            if (match === null || match[1] === module) return false
            return match[2] !== 'application'
          })
          .map((specifier) => `${file.replace(SRC, 'src/')} → ${specifier}`),
      )

      expect(violations).toEqual([])
    },
  )

  it.each(MODULES.map((module) => [module]))(
    'la présentation de %s ne pilote pas un autre contexte',
    (module) => {
      // La coordination inter-contextes appartient à `src/app/`. L'autoriser
      // entre stores recréerait, au niveau de la présentation, exactement
      // l'enchevêtrement que la règle de frontière évite dans le domaine.
      const files = tsFilesIn(join(SRC, 'modules', module, 'presentation'))

      const violations = files.flatMap((file) =>
        importsOf(file)
          .filter((specifier) => {
            const match = /modules\/([a-z_]+)\//.exec(specifier)
            return match !== null && match[1] !== module
          })
          .map((specifier) => `${file.replace(SRC, 'src/')} → ${specifier}`),
      )

      expect(violations).toEqual([])
    },
  )

  it('n’autorise aucun import du domaine vers la couche présentation ou infrastructure', () => {
    const violations = domainFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (specifier) =>
            specifier.includes('/presentation') || specifier.includes('/infrastructure'),
        )
        .map((specifier) => `${file.replace(SRC, 'src/')} → ${specifier}`),
    )

    expect(violations).toEqual([])
  })
})
