/**
 * Génère le jeu d'icônes de la PWA, sans aucune dépendance.
 *
 * Pourquoi écrire un encodeur PNG plutôt que d'installer `sharp` ou `canvas` :
 * ces paquets embarquent des binaires natifs de plusieurs dizaines de méga-octets
 * pour produire six petits fichiers qui ne changeront presque jamais. Le PNG,
 * lui, se réduit à trois morceaux (IHDR, IDAT, IEND) autour d'un `zlib.deflate`
 * fourni par Node. Le dessin est purement analytique — une ellipse et une
 * capsule — donc aucune police ni aucun tracé vectoriel à rastériser.
 *
 * Usage : node scripts/build-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'public')
const ICONS_DIR = join(PUBLIC_DIR, 'icons')

/** Repris de `styles/themes/aube/_variables.scss` : l'icône et le thème par défaut s'accordent. */
const INK = [0xfb, 0xfa, 0xf7] // --color-bg   : la cuillère, claire
const GROUND = [0x8a, 0x5a, 0x19] // --color-accent : le fond, brun chaud

// --- Encodeur PNG ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** `pixels` : RGBA non prémultiplié, `size * size * 4` octets. */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // 8 bits par canal
  header[9] = 6 // RVBA
  // Les trois octets suivants (compression, filtre, entrelacement) restent à 0,
  // seules valeurs que la spécification PNG autorise.

  // Chaque ligne est préfixée de son octet de filtre. Le filtre 0 (« None »)
  // suffit : les aplats se compressent déjà très bien, et un filtre adaptatif
  // ne gagnerait ici que quelques centaines d'octets.
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- Dessin ------------------------------------------------------------------

/**
 * La cuillère, décrite en coordonnées unitaires puis inclinée.
 *
 * `scale` resserre le dessin vers le centre : c'est ce qui produit la variante
 * `maskable`, dont le système peut rogner jusqu'à 20 % du bord.
 */
const TILT_RADIANS = (-18 * Math.PI) / 180
const BOWL = { cx: 0.5, cy: 0.32, rx: 0.145, ry: 0.195 }
const HANDLE = { x: 0.5, top: 0.46, bottom: 0.85, radius: 0.055 }

function isInk(u, v, scale) {
  // Rotation inverse autour du centre : on ramène le point dans le repère droit
  // du dessin plutôt que de faire tourner la figure.
  const dx = (u - 0.5) / scale
  const dy = (v - 0.5) / scale
  const cos = Math.cos(-TILT_RADIANS)
  const sin = Math.sin(-TILT_RADIANS)
  const x = 0.5 + dx * cos - dy * sin
  const y = 0.5 + dx * sin + dy * cos

  const ex = (x - BOWL.cx) / BOWL.rx
  const ey = (y - BOWL.cy) / BOWL.ry
  if (ex * ex + ey * ey <= 1) return true

  // Manche : distance au segment vertical, donc une capsule aux bouts arrondis.
  const clampedY = Math.min(Math.max(y, HANDLE.top), HANDLE.bottom)
  const hx = x - HANDLE.x
  const hy = y - clampedY
  return hx * hx + hy * hy <= HANDLE.radius * HANDLE.radius
}

/** Sur-échantillonnage : 4×4 sous-pixels, seule source d'anticrénelage ici. */
const SAMPLES = 4

function render(size, scale) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = (px + (sx + 0.5) / SAMPLES) / size
          const v = (py + (sy + 0.5) / SAMPLES) / size
          if (isInk(u, v, scale)) hits += 1
        }
      }

      const coverage = hits / (SAMPLES * SAMPLES)
      const offset = (py * size + px) * 4
      for (let c = 0; c < 3; c += 1) {
        pixels[offset + c] = Math.round(GROUND[c] + (INK[c] - GROUND[c]) * coverage)
      }
      // Fond plein : une icône d'application se pose sur un écran d'accueil dont
      // on ignore la couleur, et la transparence y donnerait un rendu sale.
      pixels[offset + 3] = 0xff
    }
  }

  return pixels
}

// --- Conteneur ICO -----------------------------------------------------------

/**
 * Un `.ico` peut encapsuler un PNG tel quel depuis Windows Vista, ce que tous
 * les navigateurs visés acceptent : l'en-tête se réduit alors à 22 octets.
 */
function encodeIco(size, png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // réservé
  header.writeUInt16LE(1, 2) // type : icône
  header.writeUInt16LE(1, 4) // une seule image

  const entry = Buffer.alloc(16)
  entry[0] = size < 256 ? size : 0 // 0 signifie 256
  entry[1] = size < 256 ? size : 0
  entry.writeUInt16LE(1, 4) // plans
  entry.writeUInt16LE(32, 6) // bits par pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)

  return Buffer.concat([header, entry, png])
}

// --- SVG ---------------------------------------------------------------------

function svg() {
  const bowl = `<ellipse cx="${BOWL.cx * 100}" cy="${BOWL.cy * 100}" rx="${BOWL.rx * 100}" ry="${BOWL.ry * 100}"/>`
  const handle =
    `<rect x="${(HANDLE.x - HANDLE.radius) * 100}" y="${HANDLE.top * 100}" ` +
    `width="${HANDLE.radius * 200}" height="${(HANDLE.bottom - HANDLE.top) * 100}" ` +
    `rx="${HANDLE.radius * 100}"/>`
  const tilt = (TILT_RADIANS * 180) / Math.PI

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Cuillère">
  <rect width="100" height="100" fill="#${GROUND.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>
  <g fill="#${INK.map((c) => c.toString(16).padStart(2, '0')).join('')}" transform="rotate(${tilt.toFixed(2)} 50 50)">
    ${bowl}
    ${handle}
  </g>
</svg>
`
}

// --- Sortie ------------------------------------------------------------------

const OUTPUTS = [
  { file: join(ICONS_DIR, 'icon-192.png'), size: 192, scale: 1 },
  { file: join(ICONS_DIR, 'icon-512.png'), size: 512, scale: 1 },
  // 0.66 place toute la figure dans la zone sûre des 80 % que les masques
  // circulaires d'Android conservent, avec une marge confortable.
  { file: join(ICONS_DIR, 'icon-maskable-512.png'), size: 512, scale: 0.66 },
  { file: join(ICONS_DIR, 'apple-touch-icon.png'), size: 180, scale: 1 },
]

mkdirSync(ICONS_DIR, { recursive: true })

for (const { file, size, scale } of OUTPUTS) {
  const png = encodePng(size, render(size, scale))
  writeFileSync(file, png)
  console.log(`${file.replace(ROOT + '/', '')} — ${size}px, ${png.length} octets`)
}

const faviconPng = encodePng(32, render(32, 1))
const ico = encodeIco(32, faviconPng)
writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), ico)
console.log(`public/favicon.ico — 32px, ${ico.length} octets`)

writeFileSync(join(ICONS_DIR, 'icon.svg'), svg())
console.log('public/icons/icon.svg')
