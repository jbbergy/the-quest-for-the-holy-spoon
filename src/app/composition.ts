import { EventBus } from '@/core/EventBus'
import { DatabaseProvider } from '@/core/infrastructure/database'
import {
  BrowserNetworkStatus,
  type INetworkStatus,
} from '@/core/infrastructure/NetworkStatusService'
import { ok, type Result } from '@/core/result'

import {
  AwardXpForMealUseCase,
  GetPlayerProgressUseCase,
} from '@/modules/gamification/application'
import { IndexedDbPlayerProgressRepository } from '@/modules/gamification/infrastructure/IndexedDbPlayerProgressRepository'

import {
  AddFoodToMealUseCase,
  ChangeMealEntryQuantityUseCase,
  CreateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  FindFoodUseCase,
  GetDailyJournalUseCase,
  MarkMealConsumedUseCase,
  MEAL_LOGGED,
  type MealLoggedEvent,
  RemoveMealEntryUseCase,
} from '@/modules/nutrition_inventory/application'
import { CiqualSeeder } from '@/modules/nutrition_inventory/infrastructure/CiqualSeeder'
import { IndexedDbFoodRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFoodRepository'
import { IndexedDbMealRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbMealRepository'
import { OpenFoodFactsProvider } from '@/modules/nutrition_inventory/infrastructure/OpenFoodFactsProvider'

import { SuggestMealCompletionUseCase } from '@/modules/planning/application'

import {
  CreatePlayerProfileUseCase,
  GetCurrentPlayerUseCase,
  UpdatePlayerProfileUseCase,
} from '@/modules/player_profile/application'
import { IndexedDbPlayerRepository } from '@/modules/player_profile/infrastructure/IndexedDbPlayerRepository'

/**
 * Racine de composition.
 *
 * C'est le **seul** endroit de l'application où des implémentations concrètes
 * sont choisies : partout ailleurs, on ne connaît que des interfaces. Substituer
 * IndexedDB par un backend distant se joue donc ici, en une ligne par port —
 * c'est ce qui rend vraie la promesse d'une persistance interchangeable.
 *
 * C'est aussi ici que les contextes sont reliés : `gamification` s'abonne à
 * l'événement de `nutrition_inventory` sans que l'un ou l'autre ne se connaisse.
 */
export interface AppContainer {
  readonly events: EventBus
  readonly network: INetworkStatus
  readonly databases: DatabaseProvider

  readonly profile: {
    readonly create: CreatePlayerProfileUseCase
    readonly getCurrent: GetCurrentPlayerUseCase
    readonly update: UpdatePlayerProfileUseCase
  }
  readonly inventory: {
    readonly find: FindFoodUseCase
    readonly createCustomFood: CreateCustomFoodUseCase
    readonly addFood: AddFoodToMealUseCase
    readonly removeEntry: RemoveMealEntryUseCase
    readonly changeQuantity: ChangeMealEntryQuantityUseCase
    readonly markConsumed: MarkMealConsumedUseCase
    readonly deleteMeal: DeleteMealUseCase
    readonly journal: GetDailyJournalUseCase
    readonly exportData: ExportInventoryUseCase
  }
  readonly gamification: {
    readonly awardXp: AwardXpForMealUseCase
    readonly getProgress: GetPlayerProgressUseCase
  }
  readonly planning: {
    readonly suggestCompletion: SuggestMealCompletionUseCase
  }

  /** Amorce le catalogue local. À appeler une fois au démarrage. */
  seedCatalog(): Promise<Result<unknown, Error>>
  dispose(): Promise<void>
}

export function createContainer(
  options: { network?: INetworkStatus } = {},
): AppContainer {
  const events = new EventBus()
  const network = options.network ?? new BrowserNetworkStatus()
  const databases = new DatabaseProvider()

  const playerRepository = new IndexedDbPlayerRepository(databases)
  const foodRepository = new IndexedDbFoodRepository(databases)
  const mealRepository = new IndexedDbMealRepository(databases)
  const progressRepository = new IndexedDbPlayerProgressRepository(databases)

  const remoteCatalog = new OpenFoodFactsProvider(network)
  const seeder = new CiqualSeeder(databases, foodRepository)

  const awardXp = new AwardXpForMealUseCase(progressRepository)

  // Le seul point de contact entre les deux contextes : un nom d'événement.
  const unsubscribe = events.on<MealLoggedEvent>(MEAL_LOGGED, async (event) => {
    const gain = await awardXp.execute(event)
    return gain.ok ? ok(undefined) : gain
  })

  return {
    events,
    network,
    databases,

    profile: {
      create: new CreatePlayerProfileUseCase(playerRepository),
      getCurrent: new GetCurrentPlayerUseCase(playerRepository),
      update: new UpdatePlayerProfileUseCase(playerRepository),
    },
    inventory: {
      find: new FindFoodUseCase(foodRepository, remoteCatalog, network),
      createCustomFood: new CreateCustomFoodUseCase(foodRepository),
      addFood: new AddFoodToMealUseCase(foodRepository, mealRepository, events),
      removeEntry: new RemoveMealEntryUseCase(mealRepository, events),
      changeQuantity: new ChangeMealEntryQuantityUseCase(mealRepository, events),
      markConsumed: new MarkMealConsumedUseCase(mealRepository),
      deleteMeal: new DeleteMealUseCase(mealRepository),
      journal: new GetDailyJournalUseCase(mealRepository),
      exportData: new ExportInventoryUseCase(mealRepository, foodRepository),
    },
    gamification: {
      awardXp,
      getProgress: new GetPlayerProgressUseCase(progressRepository),
    },
    planning: {
      suggestCompletion: new SuggestMealCompletionUseCase(),
    },

    seedCatalog: () => seeder.seedIfNeeded(),

    async dispose() {
      unsubscribe()
      events.clear()
      await databases.close()
    },
  }
}
