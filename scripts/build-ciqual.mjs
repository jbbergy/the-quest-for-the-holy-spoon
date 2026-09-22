#!/usr/bin/env node
/**
 * Convertit la table de composition nutritionnelle Ciqual (ANSES) en un JSON
 * normalisé, consommé au premier lancement pour amorcer le catalogue local.
 *
 *   node scripts/build-ciqual.mjs            # télécharge puis convertit
 *   node scripts/build-ciqual.mjs --from DIR # convertit un dossier XML déjà extrait
 *
 * Sortie : public/data/ciqual.json
 *
 * Source : ANSES-Ciqual 2020, publiée sous Licence Ouverte / Open Licence (Etalab).
 *
 * Le JSON produit (~460 Ko) **est** versionné : l'application promet de
 * fonctionner hors-ligne dès le premier lancement, ce qu'un catalogue absent
 * d'un clone frais rendrait faux. Ce script sert à le régénérer quand l'ANSES
 * publie une nouvelle édition, pas à le fabriquer à chaque installation.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'public', 'data', 'ciqual.json')

const ARCHIVE_URL =
  'https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip'

/**
 * Codes des constituants retenus. Ciqual en publie plus de soixante ; seuls ceux
 * qui alimentent le domaine sont extraits.
 *
 * Les quatre derniers sont ceux que le règlement UE 1169/2011 fait figurer sur
 * les étiquettes au-delà du triplet énergétique. Leur couverture dans l'édition
 * 2020, mesurée sur les fiches retenues : fibres 98 %, sel 94 %, AG saturés
 * 91 %, sucres 89 %.
 */
const CONST_CODE = {
  kcal: '328', // Energie, Règlement UE N° 1169/2011 (kcal/100 g)
  protein: '25000', // Protéines, N x facteur de Jones (g/100 g)
  proteinFallback: '25003', // Protéines, N x 6.25 — renseigné quand 25000 ne l'est pas
  carbs: '31000', // Glucides (g/100 g) — assimilables, fibres exclues
  fat: '40000', // Lipides (g/100 g)
  fiber: '34100', // Fibres alimentaires (g/100 g)
  sugars: '32000', // Sucres (g/100 g)
  saturatedFat: '40302', // AG saturés (g/100 g)
  salt: '10004', // Sel chlorure de sodium (g/100 g)
}

function main() {
  const fromIndex = process.argv.indexOf('--from')
  let sourceDir
  let cleanup = null

  if (fromIndex !== -1) {
    sourceDir = resolve(process.argv[fromIndex + 1] ?? '')
  } else {
    const work = mkdtempSync(join(tmpdir(), 'ciqual-'))
    cleanup = work
    sourceDir = download(work)
  }

  try {
    const foods = convert(sourceDir)
    mkdirSync(dirname(OUTPUT), { recursive: true })
    writeFileSync(OUTPUT, JSON.stringify(foods))
    const sizeKb = Math.round(Buffer.byteLength(JSON.stringify(foods)) / 1024)
    console.log(`✓ ${foods.length} aliments écrits dans public/data/ciqual.json (${sizeKb} Ko)`)
  } finally {
    if (cleanup !== null) rmSync(cleanup, { recursive: true, force: true })
  }
}

function download(work) {
  console.log(`Téléchargement de ${ARCHIVE_URL}`)
  const archive = join(work, 'ciqual.zip')

  execFileSync('curl', ['-sL', '--fail', '--max-time', '300', '-o', archive, ARCHIVE_URL], {
    stdio: 'inherit',
  })

  // Node n'expose pas de décompression ZIP native ; `unzip` est présent sur
  // macOS et la plupart des distributions Linux. Sur un poste qui en manque,
  // extraire à la main puis passer --from.
  try {
    execFileSync('unzip', ['-o', '-q', archive, '-d', work], { stdio: 'inherit' })
  } catch (cause) {
    throw new Error(
      'La commande `unzip` est requise. Extrayez l’archive manuellement puis relancez ' +
        'avec --from <dossier>.',
      { cause },
    )
  }

  return work
}

function convert(sourceDir) {
  const alimFile = findFile(sourceDir, /^alim_\d{4}_\d{2}_\d{2}\.xml$/)
  const compoFile = findFile(sourceDir, /^compo_\d{4}_\d{2}_\d{2}\.xml$/)
  const groupFile = findFile(sourceDir, /^alim_grp_\d{4}_\d{2}_\d{2}\.xml$/)

  const { groups, subGroups } = readGroups(groupFile)
  const names = readFoods(alimFile)
  const compositions = readCompositions(compoFile)

  const foods = []
  for (const [code, food] of names) {
    const composition = compositions.get(code)
    if (composition === undefined) continue

    const proteinG = composition[CONST_CODE.protein] ?? composition[CONST_CODE.proteinFallback]
    const carbsG = composition[CONST_CODE.carbs]
    const fatG = composition[CONST_CODE.fat]

    // Une fiche sans aucun macronutriment renseigné n'est pas exploitable : la
    // conserver produirait un aliment à zéro calorie qui fausserait les totaux.
    if (proteinG === undefined && carbsG === undefined && fatG === undefined) continue

    // L'énergie n'est volontairement pas exportée : le domaine la dérive des
    // macros par les coefficients d'Atwater. La stocker créerait une seconde
    // source de vérité, fausse pour les ~200 fiches où Ciqual ne la renseigne
    // pas (elle vaudrait alors 0 kcal en face de macros non nulles).
    foods.push({
      code,
      name: food.name,
      group: groups.get(food.groupCode) ?? '',
      // Le code du sous-groupe, et non son libellé : c'est lui qui sert à
      // déduire les marqueurs diététiques côté application, et un code est
      // stable là où un libellé peut être reformulé d'une édition à l'autre.
      subGroupCode: food.subGroupCode,
      subGroup: subGroups.get(food.subGroupCode) ?? '',
      proteinG: round(proteinG ?? 0),
      carbsG: round(carbsG ?? 0),
      fatG: round(fatG ?? 0),
      // Même convention que ci-dessus : un constituant non renseigné vaut zéro.
      // C'est faux au sens strict, mais une fiche absente d'un total est moins
      // trompeuse qu'une fiche qu'on écarterait du catalogue pour ce seul motif.
      fiberG: round(composition[CONST_CODE.fiber] ?? 0),
      sugarsG: round(composition[CONST_CODE.sugars] ?? 0),
      saturatedFatG: round(composition[CONST_CODE.saturatedFat] ?? 0),
      saltG: round(composition[CONST_CODE.salt] ?? 0),
    })
  }

  foods.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  reportEnergyConsistency(foods, compositions)
  reportCoverage(foods, compositions)
  return foods
}

/**
 * Contrôle qualité de la conversion.
 *
 * L'énergie déclarée par Ciqual n'est pas exportée, mais la comparer au calcul
 * d'Atwater vérifie que les bons constituants ont été extraits : un écart médian
 * de quelques kcal est normal (fibres, polyols), un écart massif signalerait un
 * code de constituant erroné.
 */
function reportEnergyConsistency(foods, compositions) {
  const deltas = []
  for (const food of foods) {
    const declared = compositions.get(food.code)?.[CONST_CODE.kcal]
    if (declared === undefined || declared <= 0) continue
    deltas.push(Math.abs(declared - (food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9)))
  }
  if (deltas.length === 0) return

  deltas.sort((a, b) => a - b)
  const median = deltas[Math.floor(deltas.length / 2)]
  console.log(
    `  contrôle : écart médian de ${median.toFixed(1)} kcal entre l’énergie Ciqual ` +
      `et le calcul d’Atwater (${deltas.length} fiches comparées)`,
  )
}

/**
 * Part des fiches où l'ANSES **renseigne** chaque nutriment complémentaire.
 *
 * La mesure porte sur les compositions brutes, avant le repli à zéro : compter
 * les valeurs non nulles confondrait « non mesuré » et « réellement absent »,
 * et ferait passer l'huile ou la viande pour des fiches lacunaires en fibres.
 *
 * Utile à la relecture d'une nouvelle édition : une couverture qui s'effondre
 * signalerait un code de constituant renommé par l'ANSES, ce que le contrôle
 * énergétique ci-dessus ne verrait pas.
 */
function reportCoverage(foods, compositions) {
  const tracked = [
    ['fibres', CONST_CODE.fiber],
    ['sucres', CONST_CODE.sugars],
    ['AG saturés', CONST_CODE.saturatedFat],
    ['sel', CONST_CODE.salt],
  ]

  const parts = tracked.map(([label, code]) => {
    const filled = foods.filter((food) => compositions.get(food.code)?.[code] !== undefined)
    return `${label} ${((100 * filled.length) / foods.length).toFixed(0)} %`
  })
  console.log(`  couverture ANSES : ${parts.join(', ')}`)
}

function findFile(dir, pattern) {
  const match = readdirSync(dir).find((entry) => pattern.test(entry))
  if (match === undefined) {
    throw new Error(`Aucun fichier correspondant à ${pattern} dans ${dir}`)
  }
  return join(dir, match)
}

/**
 * Plage 0x80–0x9F : le seul endroit où windows-1252 diffère de latin-1.
 *
 * Elle doit être écrite à la main car le `TextDecoder` de Node, construit sans
 * ICU complet, traite l'étiquette « windows-1252 » comme du latin-1 et rend
 * l'octet 0x9C (« œ ») sous forme de caractère de contrôle — ce qui mutile
 * « viandes, œufs, poissons ».
 */
const CP1252_HIGH = [
  '€', '', '‚', 'ƒ', '„', '…', '†', '‡',
  'ˆ', '‰', 'Š', '‹', 'Œ', '', 'Ž', '',
  '', '‘', '’', '“', '”', '•', '–', '—',
  '˜', '™', 'š', '›', 'œ', '', 'ž', 'Ÿ',
]

/** Les XML Ciqual sont encodés en windows-1252. */
function readXml(file) {
  const bytes = readFileSync(file)
  let out = ''
  for (const byte of bytes) {
    out += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte)
  }
  return out
}

/**
 * Lit les deux niveaux de nomenclature.
 *
 * Le niveau 1 (« viandes, œufs, poissons et assimilés ») est trop grossier pour
 * décider quoi que ce soit : il confond 788 aliments. Le niveau 2 distingue
 * « viandes cuites », « poissons crus », « œufs » ou « fruits à coque », ce qui
 * permet ensuite de déduire des marqueurs diététiques fiables.
 */
function readGroups(file) {
  const groups = new Map()
  const subGroups = new Map()

  for (const block of blocks(readXml(file), 'ALIM_GRP')) {
    const groupCode = field(block, 'alim_grp_code')
    const groupName = field(block, 'alim_grp_nom_fr')
    if (groupCode !== null && groupName !== null && !groups.has(groupCode)) {
      groups.set(groupCode, groupName)
    }

    const subCode = field(block, 'alim_ssgrp_code')
    const subName = field(block, 'alim_ssgrp_nom_fr')
    if (subCode !== null && subName !== null && !subGroups.has(subCode)) {
      subGroups.set(subCode, subName)
    }
  }

  return { groups, subGroups }
}

function readFoods(file) {
  const foods = new Map()
  for (const block of blocks(readXml(file), 'ALIM')) {
    const code = field(block, 'alim_code')
    const name = field(block, 'alim_nom_fr')
    if (code === null || name === null) continue

    foods.set(code, {
      name,
      groupCode: field(block, 'alim_grp_code') ?? '',
      subGroupCode: field(block, 'alim_ssgrp_code') ?? '',
    })
  }
  return foods
}

function readCompositions(file) {
  const wanted = new Set(Object.values(CONST_CODE))
  const compositions = new Map()

  for (const block of blocks(readXml(file), 'COMPO')) {
    const constCode = field(block, 'const_code')
    if (constCode === null || !wanted.has(constCode)) continue

    const alimCode = field(block, 'alim_code')
    if (alimCode === null) continue

    const value = parseTeneur(field(block, 'teneur'))
    if (value === null) continue

    let entry = compositions.get(alimCode)
    if (entry === undefined) {
      entry = {}
      compositions.set(alimCode, entry)
    }
    entry[constCode] = value
  }

  return compositions
}

/**
 * Les teneurs Ciqual emploient la virgule décimale, et deux marqueurs non numériques :
 * `-` (non déterminé) et `traces`. « Traces » vaut zéro pour notre usage ; « non
 * déterminé » doit rester absent, pour ne pas être confondu avec un vrai zéro.
 */
function parseTeneur(raw) {
  if (raw === null) return null
  const value = raw.trim()
  if (value === '' || value === '-') return null
  if (value.toLowerCase() === 'traces') return 0

  const parsed = Number.parseFloat(value.replace(',', '.').replace(/[<>]/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function* blocks(xml, tag) {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  for (const match of xml.matchAll(pattern)) yield match[1]
}

function field(block, name) {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)
  return match === null ? null : match[1].trim()
}

function round(value) {
  return Math.round(value * 100) / 100
}

// Appelé en fin de fichier : `main` lit des constantes déclarées plus haut, qui
// resteraient dans leur zone morte temporelle si l'appel précédait leur définition.
main()
