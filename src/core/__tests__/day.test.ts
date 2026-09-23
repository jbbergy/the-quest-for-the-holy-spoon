import { describe, expect, it } from 'vitest'

import { addDays, dateOfDay, dayKeyOf, parseDayKey, startOfWeek, weekOf } from '../day'

const key = (text: string) => {
  const parsed = parseDayKey(text)
  if (parsed === null) throw new Error(`clé de test invalide : ${text}`)
  return parsed
}

describe('dayKeyOf', () => {
  it('découpe en heure locale', () => {
    expect(dayKeyOf(new Date(2026, 8, 23, 23, 30))).toBe('2026-09-23')
  })
})

describe('parseDayKey', () => {
  it('accepte un jour réel', () => {
    expect(parseDayKey('2026-09-23')).toBe('2026-09-23')
  })

  it.each(['2026-02-30', '2026-13-01', '2026-9-23', 'demain', ''])('refuse « %s »', (text) => {
    expect(parseDayKey(text)).toBeNull()
  })
})

describe('calendrier', () => {
  it('revient au même jour après un aller-retour par Date', () => {
    expect(dayKeyOf(dateOfDay(key('2026-09-23')))).toBe('2026-09-23')
  })

  it('franchit les fins de mois et d’année', () => {
    expect(addDays(key('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(key('2026-03-01'), -1)).toBe('2026-02-28')
  })

  it('ne saute aucun jour au changement d’heure', () => {
    // Nuit du 25 au 26 octobre 2025 : 25 heures en France métropolitaine.
    expect(addDays(key('2025-10-25'), 1)).toBe('2025-10-26')
    expect(addDays(key('2025-10-26'), 1)).toBe('2025-10-27')
  })

  it('fait commencer la semaine le lundi, dimanche compris', () => {
    // Le 23 septembre 2026 est un mercredi, le 27 un dimanche.
    expect(startOfWeek(key('2026-09-23'))).toBe('2026-09-21')
    expect(startOfWeek(key('2026-09-27'))).toBe('2026-09-21')
    expect(startOfWeek(key('2026-09-21'))).toBe('2026-09-21')
  })

  it('liste les sept jours de la semaine', () => {
    expect(weekOf(key('2026-09-23'))).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
  })
})
