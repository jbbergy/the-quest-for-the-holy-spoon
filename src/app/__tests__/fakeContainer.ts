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

/** Chaque use case d'un groupe peut être remplacé par n'importe quel `execute`. */
type GroupOverrides<TGroup> = Partial<Record<keyof TGroup, Executable>>

export interface FakeContainerOverrides {
  readonly sync?: AppContainer['sync']
  readonly account?: GroupOverrides<AppContainer['account']>
  readonly profile?: GroupOverrides<AppContainer['profile']>
  readonly inventory?: GroupOverrides<AppContainer['inventory']>
  readonly planning?: GroupOverrides<AppContainer['planning']>
}

export function createFakeContainer(overrides: FakeContainerOverrides = {}): AppContainer {
  const base = {
    network: new StaticNetworkStatus(true),
    databases: { get: async () => null, close: async () => undefined },
    sync: overrides.sync ?? fakeSyncEngine(),

    account: {
      getSession: stub(ok(null)),
      signUp: stub(ok(undefined)),
      verifyEmail: stub(ok(null)),
      signIn: stub(ok(null)),
      signOut: stub(ok(undefined)),
      requestPasswordReset: stub(ok(undefined)),
      resetPassword: stub(ok(null)),
      linkPlayer: stub(ok(null)),
      deleteAccount: stub(ok(undefined)),
      ...overrides.account,
    },
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
      reschedule: stub(ok(null)),
      deleteMeal: stub(ok(undefined)),
      getMeal: stub(ok(null)),
      journal: stub(
        ok({ day: '2026-04-10', meals: [], consumedMeals: [], totalCalories: 0 }),
      ),
      week: stub(ok({ days: [] })),
      history: stub(ok([])),
      markConsumed: stub(ok(null)),
      exportData: stub(ok({ meals: [], customFoods: [] })),
      ...overrides.inventory,
    },
    planning: {
      suggestCompletion: { execute: () => ok(null) },
      recentIntake: { execute: () => ok(null) },
      ...overrides.planning,
    },

    seedCatalog: async (): Promise<Result<unknown, Error>> => ok(undefined),
    dispose: async (): Promise<void> => undefined,
  }

  return base as unknown as AppContainer
}

/**
 * Moteur de synchronisation inerte : aucun compte, rien à transporter. Les
 * tests de la synchronisation elle-même montent le vrai moteur.
 */
export function fakeSyncEngine(): AppContainer['sync'] {
  const status = { phase: 'off', pending: 0, lastSyncedAt: null, error: null } as const
  return {
    status,
    subscribe: (listener: (value: typeof status) => void) => {
      listener(status)
      return () => undefined
    },
    onRemoteChanges: () => () => undefined,
    connect: async () => ok('resumed'),
    schedule: () => undefined,
    sync: async () => undefined,
    flush: async () => 0,
    disconnect: async () => ok(undefined),
  } as unknown as AppContainer['sync']
}

/** Use Case qui réussit toujours avec la valeur donnée. */
export const succeedsWith = (value: unknown): Executable => stub(ok(value))

/** Use Case qui échoue toujours avec l'erreur donnée. */
export const failsWith = (error: unknown): Executable => stub({ ok: false, error })
