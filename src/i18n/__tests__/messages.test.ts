import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { baseCompile } from '@intlify/message-compiler'
import { describe, expect, it } from 'vitest'

import { en } from '../messages/en'
import { fr } from '../messages/fr'

/**
 * Garde-fous des traductions.
 *
 * Le typage impose déjà les mêmes clés en français et en anglais ; ce test
 * couvre ce que le typage ne voit pas : les repères `{nom}` et les formes de
 * pluriel qui doivent correspondre, la syntaxe des messages, et les clés
 * employées dans le code qui doivent exister.
 */
type Tree = { readonly [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') leaves.set(path, value)
    else for (const [nested, text] of flatten(value, path)) leaves.set(nested, text)
  }
  return leaves
}

const french = flatten(fr)
const english = flatten(en as Tree)

/**
 * Repères `{nom}` d'un texte. `{of}` (« Journée d'Alex », article élidé) est
 * propre au français : l'anglais dit `{name}`, et les deux se répondent.
 */
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => (match[1] === 'of' ? 'name' : match[1]!)).sort()

const choicesOf = (text: string): number => text.split(' | ').length

describe('textes de l’application', () => {
  it('ont les mêmes clés en français et en anglais', () => {
    expect([...english.keys()].sort()).toEqual([...french.keys()].sort())
  })

  it('ont les mêmes repères en français et en anglais', () => {
    const mismatches = [...french]
      .filter(([key, text]) => {
        const other = english.get(key)!
        return placeholders(text).join() !== placeholders(other).join()
      })
      .map(([key]) => key)

    expect(mismatches).toEqual([])
  })

  it('ont les mêmes formes de pluriel en français et en anglais', () => {
    const mismatches = [...french]
      .filter(([key, text]) => choicesOf(text) !== choicesOf(english.get(key)!))
      .map(([key]) => key)

    expect(mismatches).toEqual([])
  })

  it('ne laissent aucun texte vide', () => {
    const empty = [...french, ...english].filter(([, text]) => text.trim() === '').map(([key]) => key)

    expect(empty).toEqual([])
  })

  it.each([
    ['français', french],
    ['anglais', english],
  ])('sont tous rédigés dans une syntaxe valide (%s)', (_language, messages) => {
    const invalid: string[] = []
    for (const [key, text] of messages) {
      let failed = false
      baseCompile(text, { onError: () => (failed = true) })
      if (failed) invalid.push(key)
    }

    expect(invalid).toEqual([])
  })
})

const SRC = fileURLToPath(new URL('../..', import.meta.url))

function sourcesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'messages' ? [] : sourcesIn(full)
    }
    return /\.(ts|vue)$/.test(entry) ? [full] : []
  })
}

describe('clés employées dans le code', () => {
  const namespaces = new Set([...french.keys()].map((key) => key.split('.')[0]!))
  // Guillemets simples et apostrophes inverses seulement : dans un gabarit Vue,
  // les guillemets doubles délimitent une expression (`v-if="account.session"`).
  const literal = new RegExp(`['\`]((?:${[...namespaces].join('|')})\\.[A-Za-z0-9_.]+)['\`]`, 'g')
  const direct = /\b(?:t|te)\(\s*'([A-Za-z0-9_.]+)'|path="([A-Za-z0-9_.]+)"/g

  const files = sourcesIn(SRC).filter((file) => !file.includes('/dev/'))
  const used = new Map<string, string>()
  const called = new Map<string, string>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(literal)) used.set(match[1]!, file)
    for (const match of source.matchAll(direct)) called.set((match[1] ?? match[2])!, file)
  }

  const exists = (key: string): boolean =>
    french.has(key) || [...french.keys()].some((known) => known.startsWith(`${key}.`))

  it('trouve bien des clés à contrôler', () => {
    // Si le repérage cessait de fonctionner, les contrôles suivants passeraient à vide.
    expect(used.size).toBeGreaterThan(100)
    expect(called.size).toBeGreaterThan(100)
  })

  it('existent toutes dans les textes', () => {
    const missing = [...used].filter(([key]) => !exists(key)).map(([key, file]) => `${key} (${file.replace(SRC, 'src/')})`)

    expect(missing).toEqual([])
  })

  it('désignent, quand elles sont passées à t(), un texte et non un groupe', () => {
    const groups = [...called].filter(([key]) => !french.has(key)).map(([key]) => key)

    expect(groups).toEqual([])
  })
})
