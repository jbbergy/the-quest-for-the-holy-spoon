/**
 * Langues de l'application et choix de celle à employer.
 *
 * Deux notions à ne pas confondre : la **préférence** (« automatique », ou une
 * langue précise choisie dans les réglages) et la **langue effective**, celle
 * dont les textes s'affichent. Tant que rien n'est choisi, la langue effective
 * suit l'appareil ; dès qu'une langue est choisie, elle ne le suit plus.
 */
export const SUPPORTED_LOCALES = ['fr', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** Langue de référence : celle des textes d'origine, et de repli quand un texte manque ailleurs. */
export const DEFAULT_LOCALE: Locale = 'fr'

/** Langue prise quand celle de l'appareil n'est pas prise en charge, ou inconnue. */
export const DEVICE_FALLBACK_LOCALE: Locale = 'en'

/** « Suivre l'appareil », ou une langue imposée. */
export type LocalePreference = Locale | 'auto'

export const AUTO_LOCALE = 'auto'

/** Étiquette BCP 47 pour `Intl` : les nombres et les dates suivent la langue choisie. */
export const INTL_TAGS: Readonly<Record<Locale, string>> = {
  fr: 'fr-FR',
  en: 'en-GB',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Première langue de l'appareil que l'application sait parler.
 *
 * Les navigateurs classent les langues par ordre de préférence (`fr-CA`,
 * `en-US`…) : seule la langue de base compte ici, et l'ordre est respecté —
 * « de, en » donne l'anglais, l'allemand n'étant pas pris en charge.
 */
export function matchDeviceLocale(deviceLanguages: readonly string[]): Locale {
  for (const tag of deviceLanguages) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
  }
  return DEVICE_FALLBACK_LOCALE
}

export function resolveLocale(
  preference: LocalePreference,
  deviceLanguages: readonly string[],
): Locale {
  return preference === AUTO_LOCALE ? matchDeviceLocale(deviceLanguages) : preference
}

/** Langues de l'appareil, prudente hors navigateur. */
export function readDeviceLanguages(): readonly string[] {
  const nav = globalThis.navigator
  if (nav === undefined) return []
  if (nav.languages !== undefined && nav.languages.length > 0) return nav.languages
  return nav.language === undefined || nav.language === '' ? [] : [nav.language]
}
