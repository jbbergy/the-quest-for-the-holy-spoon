import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Contrastes des thèmes (WCAG 2.2 AA).
 *
 * Les couleurs sont lues **dans les fichiers de thème** : un réglage de teinte
 * qui ferait passer un texte sous 4,5:1, ou un repère graphique sous 3:1,
 * casse ce test au lieu de passer inaperçu jusqu'à l'audit.
 */
const THEMES_DIR = fileURLToPath(new URL('../../../styles/themes/', import.meta.url))

function readTheme(id: string): Record<string, string> {
  const source = readFileSync(`${THEMES_DIR}${id}/_variables.scss`, 'utf8')
  const colors: Record<string, string> = {}
  for (const match of source.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    colors[match[1]!] = match[2]!
  }
  return colors
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/** Texte : 4,5:1 (critère 1.4.3). */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['accent', 'bg'],
  ['accent', 'surface-raised'],
  ['accent-contrast', 'accent'],
  ['accent-strong', 'accent-soft'],
  ['danger', 'bg'],
  ['danger', 'surface-raised'],
  ['danger-strong', 'danger-soft'],
  ['danger-strong', 'surface-raised'],
  ['bg', 'danger'],
  ['text-muted', 'track'],
  ['success', 'surface-raised'],
  ['on-saffron', 'saffron'],
  ['on-saffron-soft', 'saffron-soft'],
  ['on-inverse', 'inverse'],
  ['on-inverse-muted', 'inverse'],
]

/** Repères graphiques et contours de commandes : 3:1 (critère 1.4.11). */
const GRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  ['marker', 'surface-raised'],
  ['marker', 'bg'],
  ['border-strong', 'surface-raised'],
  ['border-strong', 'bg'],
  ['focus', 'bg'],
  ['focus', 'surface-raised'],
  ['accent', 'track'],
  ['danger', 'track'],
]

const themeIds = readdirSync(THEMES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe.each(themeIds)('thème %s', (id) => {
  const colors = readTheme(id)

  it.each(TEXT_PAIRS)('texte %s sur %s : au moins 4,5:1', (fg, bg) => {
    expect(colors[fg], `--color-${fg}`).toBeDefined()
    expect(colors[bg], `--color-${bg}`).toBeDefined()
    expect(ratio(colors[fg]!, colors[bg]!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GRAPHIC_PAIRS)('repère %s sur %s : au moins 3:1', (fg, bg) => {
    expect(colors[fg], `--color-${fg}`).toBeDefined()
    expect(colors[bg], `--color-${bg}`).toBeDefined()
    expect(ratio(colors[fg]!, colors[bg]!)).toBeGreaterThanOrEqual(3)
  })
})
