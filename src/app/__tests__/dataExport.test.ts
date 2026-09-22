// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildExport, EXPORT_FORMAT, EXPORT_VERSION, exportFileName } from '@/app/dataExport'
import { downloadJson } from '@/app/download'
import { provideContainer, resetContainer } from '@/app/container'
import { collectExport, useDataExport } from '@/app/useDataExport'
import { idFrom, type PlayerId } from '@/core/identity'
import { isErr } from '@/core/result'
import { PlayerProgress } from '@/modules/gamification/domain/PlayerProgress'
import { ActivityLevel } from '@/modules/player_profile/domain/ActivityLevel'
import { BiologicalSex, BodyMeasurements } from '@/modules/player_profile/domain/BodyMeasurements'
import { DietaryPreferences } from '@/modules/player_profile/domain/DietaryPreferences'
import { Player } from '@/modules/player_profile/domain/Player'

import { createFakeContainer, failsWith, succeedsWith } from './fakeContainer'

const playerId: PlayerId = idFrom('player-1')

const player = Player.reconstitute({
  id: playerId,
  name: 'Perceval',
  measurements: BodyMeasurements.reconstitute({
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
  }),
  activityLevel: ActivityLevel.MODERATE,
  preferences: DietaryPreferences.reconstitute({ restrictions: [], allergens: [] }),
})

const EXPORTED_AT = new Date('2026-09-22T21:45:00')

const parts = {
  player: {
    name: 'Perceval',
    heightCm: 180,
    weightKg: 80,
    ageYears: 30,
    biologicalSex: BiologicalSex.MALE,
    activityLevel: ActivityLevel.MODERATE,
    restrictions: [],
    allergens: [],
    basalMetabolicRate: 1780,
    totalDailyEnergyExpenditure: 2759,
    targetCalories: 2759,
    targetMacros: { proteinG: 117, carbsG: 331, fatG: 107 },
    referenceNutrients: { fiberG: 30, sugarsG: 100, saturatedFatG: 36.8, saltG: 5 },
  },
  progress: { level: 3, totalXp: 420, milestones: ['FIRST_MEAL'] },
  meals: [],
  customFoods: [],
}

describe('buildExport', () => {
  it('annonce son format et sa version avant toute donnée', () => {
    const archive = buildExport(parts, EXPORTED_AT)

    // Un futur import doit pouvoir refuser un fichier étranger sans avoir à
    // interpréter la moindre valeur nutritionnelle.
    const [first, second] = Object.keys(archive)
    expect(first).toBe('format')
    expect(second).toBe('version')
    expect(archive.format).toBe(EXPORT_FORMAT)
    expect(archive.version).toBe(EXPORT_VERSION)
  })

  it('horodate en ISO sans lire l’horloge lui-même', () => {
    expect(buildExport(parts, EXPORTED_AT).exportedAt).toBe(EXPORTED_AT.toISOString())
  })

  it('survit à un aller-retour JSON', () => {
    const archive = buildExport(parts, EXPORTED_AT)

    expect(JSON.parse(JSON.stringify(archive))).toEqual(archive)
  })
})

describe('exportFileName', () => {
  it('date le fichier en heure locale', () => {
    expect(exportFileName(new Date('2026-09-22T21:45:00'))).toBe('holy-spoon-2026-09-22.json')
  })

  it('ne bascule pas sur la veille pour un export de fin de soirée', () => {
    // Le même instant vu en UTC tomberait le 22 au matin à l'ouest ; c'est le
    // jour vécu par l'utilisateur qui doit nommer son fichier.
    expect(exportFileName(new Date('2026-09-22T23:59:00'))).toBe('holy-spoon-2026-09-22.json')
  })

  it('complète les mois et les jours à deux chiffres', () => {
    expect(exportFileName(new Date('2026-01-05T09:00:00'))).toBe('holy-spoon-2026-01-05.json')
  })
})

describe('collectExport', () => {
  const containerWith = (
    overrides: Parameters<typeof createFakeContainer>[0] = {},
  ): ReturnType<typeof createFakeContainer> =>
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player) } as never,
      gamification: {
        getProgress: succeedsWith(PlayerProgress.reconstitute({ playerId, totalXp: 420 })),
      } as never,
      ...overrides,
    })

  it('assemble les trois contextes en une seule archive', async () => {
    const container = containerWith({
      inventory: {
        exportData: succeedsWith({
          meals: [{ id: idFrom('meal-1'), type: 'LUNCH', entries: [] }],
          customFoods: [{ id: idFrom('food-1'), name: 'Gratin' }],
        }),
      } as never,
    })

    const archive = await collectExport(container, EXPORTED_AT)

    expect(archive.ok).toBe(true)
    if (!archive.ok) return
    expect(archive.value.player.name).toBe('Perceval')
    expect(archive.value.progress.totalXp).toBe(420)
    expect(archive.value.meals).toHaveLength(1)
    expect(archive.value.customFoods).toHaveLength(1)
  })

  it('n’archive de la progression que ce qui est réellement stocké', async () => {
    const archive = await collectExport(containerWith(), EXPORTED_AT)

    expect(archive.ok).toBe(true)
    if (!archive.ok) return
    // Avancement dans le niveau et XP restante se recalculent : ils n'ont leur
    // place que dans une jauge, pas dans une archive.
    expect(Object.keys(archive.value.progress)).toEqual(['level', 'totalXp', 'milestones'])
  })

  it('refuse d’exporter quand aucun profil n’est actif', async () => {
    const container = createFakeContainer({
      profile: { getCurrent: succeedsWith(null) } as never,
    })

    const result = await collectExport(container, EXPORTED_AT)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('NO_CURRENT_PROFILE')
  })

  it('remonte l’échec du profil sans le déguiser', async () => {
    const container = createFakeContainer({
      profile: {
        getCurrent: failsWith(Object.assign(new Error('base illisible'), { code: 'BOOM' })),
      } as never,
    })

    const result = await collectExport(container, EXPORTED_AT)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('BOOM')
  })

  it('remonte l’échec de l’inventaire', async () => {
    const container = containerWith({
      inventory: {
        exportData: failsWith(
          Object.assign(new Error('historique illisible'), { code: 'HISTORY_UNREADABLE' }),
        ),
      } as never,
    })

    const result = await collectExport(container, EXPORTED_AT)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('HISTORY_UNREADABLE')
  })

  it('remonte l’échec de la progression', async () => {
    const container = containerWith({
      gamification: {
        getProgress: failsWith(Object.assign(new Error('xp illisible'), { code: 'XP_DOWN' })),
      } as never,
    })

    const result = await collectExport(container, EXPORTED_AT)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('XP_DOWN')
  })
})

describe('downloadJson', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clicked: HTMLAnchorElement[]

  beforeEach(() => {
    vi.useFakeTimers()
    clicked = []
    createObjectURL = vi.fn(() => 'blob:fake')
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('déclenche le téléchargement sous le nom demandé', () => {
    const result = downloadJson('holy-spoon-2026-09-22.json', { hello: 'monde' })

    expect(result.ok).toBe(true)
    expect(clicked).toHaveLength(1)
    expect(clicked[0]?.download).toBe('holy-spoon-2026-09-22.json')
    expect(clicked[0]?.href).toBe('blob:fake')
  })

  it('retire le lien du document une fois le clic émis', () => {
    downloadJson('archive.json', {})

    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('ne révoque l’URL qu’après le tour de boucle', () => {
    downloadJson('archive.json', {})

    // Révoquer dans la foulée du clic annule le transfert sur certains
    // navigateurs : le délai n'est pas cosmétique.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('produit un JSON indenté, destiné à être relu', async () => {
    downloadJson('archive.json', { player: { name: 'Perceval' } })

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('{\n  "player": {\n    "name": "Perceval"\n  }\n}')
  })

  it('retourne une erreur au lieu d’un bouton inerte quand l’URL échoue', () => {
    URL.createObjectURL = (() => {
      throw new Error('stockage restreint')
    }) as unknown as typeof URL.createObjectURL

    const result = downloadJson('archive.json', {})

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('DOWNLOAD_FAILED')
  })
})

describe('useDataExport', () => {
  let clicked: HTMLAnchorElement[]

  const containerWith = (
    overrides: Parameters<typeof createFakeContainer>[0] = {},
  ): ReturnType<typeof createFakeContainer> =>
    createFakeContainer({
      profile: { getCurrent: succeedsWith(player) } as never,
      gamification: {
        getProgress: succeedsWith(PlayerProgress.reconstitute({ playerId, totalXp: 420 })),
      } as never,
      ...overrides,
    })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(EXPORTED_AT)
    clicked = []
    URL.createObjectURL = (() => 'blob:fake') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as unknown as typeof URL.revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetContainer()
  })

  it('produit le fichier et l’annonce par son nom', async () => {
    provideContainer(containerWith())
    const exporter = useDataExport()

    expect(await exporter.run()).toBe(true)

    expect(clicked[0]?.download).toBe('holy-spoon-2026-09-22.json')
    expect(exporter.lastFileName.value).toBe('holy-spoon-2026-09-22.json')
    expect(exporter.error.value).toBeNull()
    expect(exporter.busy.value).toBe(false)
  })

  it('expose l’erreur de collecte sans produire de fichier', async () => {
    provideContainer(
      createFakeContainer({ profile: { getCurrent: succeedsWith(null) } as never }),
    )
    const exporter = useDataExport()

    expect(await exporter.run()).toBe(false)

    expect(clicked).toHaveLength(0)
    expect(exporter.error.value?.code).toBe('NO_CURRENT_PROFILE')
    expect(exporter.lastFileName.value).toBeNull()
  })

  it('expose l’erreur du téléchargement lui-même', async () => {
    URL.createObjectURL = (() => {
      throw new Error('stockage restreint')
    }) as unknown as typeof URL.createObjectURL
    provideContainer(containerWith())
    const exporter = useDataExport()

    expect(await exporter.run()).toBe(false)

    expect(exporter.error.value?.code).toBe('DOWNLOAD_FAILED')
  })

  it('efface l’annonce précédente avant de recommencer', async () => {
    provideContainer(containerWith())
    const exporter = useDataExport()
    await exporter.run()

    provideContainer(
      createFakeContainer({ profile: { getCurrent: succeedsWith(null) } as never }),
    )
    await exporter.run()

    // Sans cette remise à zéro, la région `aria-live` annoncerait encore un
    // fichier produit alors que la tentative vient d'échouer.
    expect(exporter.lastFileName.value).toBeNull()
  })

  it('ignore un second déclenchement pendant qu’un export est en cours', async () => {
    let release = (): void => undefined
    provideContainer(
      containerWith({
        inventory: {
          exportData: {
            execute: () =>
              new Promise((resolve) => {
                release = () => {
                  resolve({ ok: true, value: { meals: [], customFoods: [] } })
                }
              }),
          },
        } as never,
      }),
    )
    const exporter = useDataExport()

    const first = exporter.run()
    expect(exporter.busy.value).toBe(true)
    expect(await exporter.run()).toBe(false)

    release()
    expect(await first).toBe(true)
    expect(clicked).toHaveLength(1)
  })
})
