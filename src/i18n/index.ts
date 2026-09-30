import { createI18n } from 'vue-i18n'

import { en } from './messages/en'
import { fr } from './messages/fr'
import { DEFAULT_LOCALE, INTL_TAGS, type Locale } from './locale'

export { DEFAULT_LOCALE, INTL_TAGS, SUPPORTED_LOCALES, type Locale } from './locale'

/**
 * Pluriel : le français compte « 0 » et « 1,5 » au singulier, l'anglais non.
 *
 * Avec deux formes (« tranche | tranches »), l'indice 0 est le singulier. Avec
 * trois (« aucun | un | {n} »), zéro et un ont chacun la leur.
 */
function frenchPlural(choice: number, choicesLength: number): number {
  if (choicesLength === 2) return Math.abs(choice) < 2 ? 0 : 1
  return choice === 0 ? 0 : choice === 1 ? 1 : 2
}

function englishPlural(choice: number, choicesLength: number): number {
  if (choicesLength === 2) return choice === 1 ? 0 : 1
  return choice === 0 ? 0 : choice === 1 ? 1 : 2
}

/**
 * L'instance est **globale** et n'est pas installée comme plugin Vue : les
 * composants importent `t` directement. Une fonction `t` lue dans un rendu ou
 * un `computed` suit la langue courante (`locale` est réactive), donc changer
 * de langue redessine l'écran sans rechargement ; et les modules hors
 * composant — titres de page, libellés, conseils — s'en servent de la même
 * façon, sans `useI18n`, qui exige un composant.
 */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en },
  pluralRules: { fr: frenchPlural, en: englishPlural },
  // Un texte manquant en anglais retombe sur le français : mieux vaut une
  // phrase dans la mauvaise langue qu'une clé brute. Un test garde la parité.
  missingWarn: import.meta.env?.DEV === true,
  fallbackWarn: false,
})

export const t = i18n.global.t
export const te = i18n.global.te

export function currentLocale(): Locale {
  return i18n.global.locale.value
}

export function setCurrentLocale(locale: Locale): void {
  i18n.global.locale.value = locale
}

/** Étiquette `Intl` de la langue courante (`fr-FR`, `en-GB`). */
export function intlTag(): string {
  return INTL_TAGS[currentLocale()]
}

/**
 * Formateurs `Intl` suivant la langue courante.
 *
 * Un `Intl.NumberFormat` créé une fois pour toutes au chargement du module
 * garderait la langue de ce moment : ici, l'instance est refaite quand la
 * langue change, et ne l'est qu'alors.
 */
const numberFormats = new Map<string, Intl.NumberFormat>()

export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${intlTag()}|${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (format === undefined) {
    format = new Intl.NumberFormat(intlTag(), options)
    numberFormats.set(key, format)
  }
  return format
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

export function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${intlTag()}|${JSON.stringify(options)}`
  let format = dateFormats.get(key)
  if (format === undefined) {
    format = new Intl.DateTimeFormat(intlTag(), options)
    dateFormats.set(key, format)
  }
  return format
}

/** Liste en toutes lettres : « pain, riz et thé » / « bread, rice, and tea ». */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(intlTag(), { style: 'long', type: 'conjunction' }).format(items)
}

/** Minuscules dans la langue courante (le « İ » turc n'est pas le sujet, mais l'habitude est bonne). */
export function lower(text: string): string {
  return text.toLocaleLowerCase(intlTag())
}

export function upperFirst(text: string): string {
  return `${text.charAt(0).toLocaleUpperCase(intlTag())}${text.slice(1)}`
}

/**
 * Un objet dont chaque propriété est un texte **lu à la demande**.
 *
 * Certains modules exportent des tables de libellés (`GLOSSARY`, les options du
 * profil) que les écrans lisent comme de simples propriétés. Des accesseurs
 * gardent cette forme tout en suivant la langue courante : le texte n'est
 * traduit qu'au moment de l'affichage, jamais figé à l'import du module.
 */
export function lazyTexts<K extends string>(
  prefix: string,
  keys: readonly K[],
): Readonly<Record<K, string>> {
  const texts = {} as Record<K, string>
  for (const key of keys) {
    Object.defineProperty(texts, key, { enumerable: true, get: () => t(`${prefix}.${key}`) })
  }
  return texts
}

/** Une option de choix : sa valeur, et son libellé lu dans la langue courante. */
export interface LabelledOption<V> {
  readonly value: V
  readonly label: string
}

export interface DetailedOption<V> extends LabelledOption<V> {
  readonly hint: string
}

/** `label` est le texte de `path`. */
export function labelled<V>(value: V, path: string): LabelledOption<V> {
  return {
    value,
    get label() {
      return t(path)
    },
  }
}

/** `label` et `hint` sont les textes de `path.label` et `path.hint`. */
export function detailed<V>(value: V, path: string): DetailedOption<V> {
  return {
    value,
    get label() {
      return t(`${path}.label`)
    },
    get hint() {
      return t(`${path}.hint`)
    },
  }
}
