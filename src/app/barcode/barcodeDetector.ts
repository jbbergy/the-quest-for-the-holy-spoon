/**
 * Lire un code-barres dans une image de la caméra.
 *
 * Chrome sur Android sait le faire seul (`BarcodeDetector`) ; Firefox et
 * Safari non. Pour eux, la même interface est chargée à la demande depuis
 * `barcode-detector`, qui embarque ZXing compilé en WebAssembly (≈ 1 Mo) :
 * le fichier est servi par l'application elle-même — la CSP n'autorise aucun
 * autre script — et seulement à la première lecture.
 *
 * Seuls les formats des produits alimentaires sont cherchés : moins de formats,
 * c'est une lecture plus rapide, et pas de QR code pris pour un aliment. Pas
 * d'UPC-E : ce code américain de 8 chiffres est quasi absent des rayons
 * français, et une tranche d'EAN-13 mal cadrée passait souvent pour lui.
 */

/** Ce qu'on attend d'un détecteur, natif ou non. */
export interface BarcodeReader {
  detect(
    source: HTMLVideoElement | HTMLCanvasElement,
  ): Promise<readonly { readonly rawValue: string }[]>
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const

/**
 * Un code de produit valide : 8, 12 ou 13 chiffres, dont le dernier est la clé
 * de contrôle des GTIN (poids 3 et 1 en alternance, depuis la droite).
 */
export function isValidProductCode(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return false
  const digits = [...code].map(Number)
  const check = digits.pop()
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/**
 * Un code n'est retenu qu'après plusieurs lectures identiques. Une seule image
 * floue ou un code à moitié cadré suffisent à produire un numéro faux mais à la
 * clé correcte (une chance sur dix) ; le même numéro deux fois de suite, c'est
 * le bon. Une image sans code ne remet pas le compte à zéro — la main bouge —
 * un autre numéro, si.
 */
export class ReadingConfirmation {
  private candidate: string | null = null
  private count = 0

  constructor(private readonly needed = 2) {}

  /** Les numéros lus sur une image ; rend le code une fois confirmé. */
  see(codes: readonly string[]): string | null {
    const code = codes.find(isValidProductCode)
    if (code === undefined) return null
    if (code === this.candidate) {
      this.count += 1
    } else {
      this.candidate = code
      this.count = 1
    }
    return this.count >= this.needed ? code : null
  }
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): BarcodeReader
  getSupportedFormats(): Promise<readonly string[]>
}

/** La caméra n'est accessible qu'en contexte sécurisé (HTTPS ou localhost). */
export function canScanBarcodes(): boolean {
  return typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined
}

async function nativeReader(): Promise<BarcodeReader | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector
  if (Native === undefined) return null
  try {
    const supported = await Native.getSupportedFormats()
    const formats = FORMATS.filter((format) => supported.includes(format))
    return formats.length === 0 ? null : new Native({ formats })
  } catch {
    return null
  }
}

async function wasmReader(): Promise<BarcodeReader> {
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // Le module est instancié tout de suite, pas à la première image : une
  // WebAssembly refusée (CSP sans `'wasm-unsafe-eval'`, fichier introuvable)
  // échoue ici, à l'ouverture, au lieu de faire tourner le scanner à vide.
  await prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
    fireImmediately: true,
  })
  return new BarcodeDetector({ formats: [...FORMATS] })
}

let reader: Promise<BarcodeReader> | null = null

/** Le détecteur natif s'il lit nos formats, ZXing sinon ; créé une seule fois. */
export function barcodeReader(): Promise<BarcodeReader> {
  reader ??= nativeReader().then((native) => native ?? wasmReader())
  reader.catch(() => {
    reader = null
  })
  return reader
}
