import { describe, expect, it, vi } from 'vitest'

import { ApiClient } from '@/contract/apiClient'
import { idFrom } from '@/core/identity'
import { mealToRecord } from '@/modules/nutrition_inventory/infrastructure/records'
import { playerToRecord } from '@/modules/player_profile/infrastructure/records'

import { mealOf, playerOf, unwrap } from '../../sync/__tests__/fixtures'
import { sharedNeedsOf } from '../../sync/sharedNeeds'
import { MemberDaysReader } from '../memberDays'

const alex = idFrom<'PlayerId'>('player-alex')

/** Repas d'Alex, pris ou non, prévu un jour donné. */
function alexMeal(dayKey: string, grams: number, consumed: boolean) {
  const record = mealToRecord(mealOf('player-alex', grams))
  return {
    ...record,
    dayKey,
    consumedAt: consumed ? `${dayKey}T12:30:00.000Z` : null,
  }
}

function readerAnswering(status: number, body: unknown) {
  const fetchFn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  return { reader: new MemberDaysReader(new ApiClient(fetchFn as unknown as typeof fetch)), fetchFn }
}

const needs = { ...sharedNeedsOf(playerToRecord(playerOf('player-alex'))), name: 'Alex' }

describe('MemberDaysReader', () => {
  it('demande le jour et la semaine qui le précède', async () => {
    const { reader, fetchFn } = readerAnswering(200, { meals: [], needs: null })

    await reader.read(alex, '2026-09-24' as never)

    const [url] = fetchFn.mock.calls[0] as unknown as [string]
    expect(url).toBe('/api/household/members/player-alex/days?from=2026-09-17&to=2026-09-24')
  })

  it('compte comme pour soi : seuls les repas pris font les jauges', async () => {
    const { reader } = readerAnswering(200, {
      meals: [
        alexMeal('2026-09-24', 100, true),
        alexMeal('2026-09-24', 300, false),
        alexMeal('2026-09-22', 200, true),
      ],
      needs,
    })

    const day = unwrap(await reader.read(alex, '2026-09-24' as never))

    expect(day.name).toBe('Alex')
    expect(day.needs?.targetCalories).toBe(needs.targetCalories)
    expect(day.journal.meals).toHaveLength(2)
    expect(day.journal.consumedMeals).toHaveLength(1)
    expect(day.recent?.trackedDays).toBe(1)
  })

  it('montre les repas même sans besoins publiés, mais sans moyennes', async () => {
    const { reader } = readerAnswering(200, { meals: [alexMeal('2026-09-24', 100, true)], needs: null })

    const day = unwrap(await reader.read(alex, '2026-09-24' as never))

    expect(day).toMatchObject({ name: null, needs: null, recent: null })
    expect(day.journal.consumedMeals).toHaveLength(1)
  })

  it('écarte un repas illisible plutôt que toute la journée', async () => {
    const { reader } = readerAnswering(200, {
      meals: [{ id: 'abîmé', playerId: 'player-alex', dayKey: '2026-09-24' }, alexMeal('2026-09-24', 100, true)],
      needs: { id: 'player-alex', name: 'incomplet' },
    })

    const day = unwrap(await reader.read(alex, '2026-09-24' as never))

    expect(day.journal.meals).toHaveLength(1)
    expect(day.needs).toBeNull()
  })

  it('transmet le refus quand le membre ne partage pas ses journées', async () => {
    const { reader } = readerAnswering(403, { error: { code: 'DAYS_NOT_SHARED', message: 'non' } })

    const result = await reader.read(alex, '2026-09-24' as never)

    expect(!result.ok && result.error.code).toBe('DAYS_NOT_SHARED')
  })
})
