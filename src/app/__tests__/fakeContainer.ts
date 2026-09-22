import { EventBus } from '@/core/EventBus'
import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { ok, type Result } from '@/core/result'

import type { AppContainer } from '@/app/composition'

/**
 * Conteneur de test.
 *
 * Les Use Cases sont mockés **à la frontière application/présentation** : les
 * tests de stores vérifient qu'un `Result` est correctement déplié, pas que la
 * logique métier est juste — celle-ci est déjà couverte par les tests de
 * domaine et de Use Cases, sans qu'aucun store n'ait besoin d'exister.
 */
type Executable = { execute: (...args: never[]) => unknown }

const stub = (result: unknown): Executable => ({ execute: async () => result })

export interface FakeContainerOverrides {
  readonly profile?: Partial<AppContainer['profile']>
  readonly inventory?: Partial<AppContainer['inventory']>
  readonly gamification?: Partial<AppContainer['gamification']>
  readonly planning?: Partial<AppContainer['planning']>
}

export function createFakeContainer(overrides: FakeContainerOverrides = {}): AppContainer {
  const events = new EventBus()

  const base = {
    events,
    network: new StaticNetworkStatus(true),
    databases: { get: async () => null, close: async () => undefined },

    profile: {
      create: stub(ok(null)),
      getCurrent: stub(ok(null)),
      update: stub(ok(null)),
      ...overrides.profile,
    },
    inventory: {
      find: stub(ok({ kind: 'by_name', items: [], onlineSearched: true })),
      createCustomFood: stub(ok(null)),
      addFood: stub(ok(null)),
      removeEntry: stub(ok(null)),
      changeQuantity: stub(ok(null)),
      deleteMeal: stub(ok(undefined)),
      journal: stub(
        ok({ day: '2026-04-10', meals: [], consumedMeals: [], totalCalories: 0 }),
      ),
      markConsumed: stub(ok(null)),
      exportData: stub(ok({ meals: [], customFoods: [] })),
      ...overrides.inventory,
    },
    gamification: {
      awardXp: stub(ok(null)),
      getProgress: stub(ok(null)),
      ...overrides.gamification,
    },
    planning: {
      suggestCompletion: { execute: () => ok(null) },
      ...overrides.planning,
    },

    seedCatalog: async (): Promise<Result<unknown, Error>> => ok(undefined),
    dispose: async (): Promise<void> => undefined,
  }

  return base as unknown as AppContainer
}

/** Use Case qui réussit toujours avec la valeur donnée. */
export const succeedsWith = (value: unknown): Executable => stub(ok(value))

/** Use Case qui échoue toujours avec l'erreur donnée. */
export const failsWith = (error: unknown): Executable => stub({ ok: false, error })
