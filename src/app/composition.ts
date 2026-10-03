import { DatabaseProvider } from '@/core/infrastructure/database'
import {
  BrowserNetworkStatus,
  type INetworkStatus,
} from '@/core/infrastructure/NetworkStatusService'
import type { Result } from '@/core/result'

import {
  DeleteAccountUseCase,
  GetSessionUseCase,
  LinkPlayerUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  SignInUseCase,
  SignOutUseCase,
  SignUpUseCase,
  VerifyEmailUseCase,
} from '@/modules/account/application'
import { HttpAccountGateway } from '@/modules/account/infrastructure/HttpAccountGateway'

import {
  AcceptInvitationUseCase,
  CreateHouseholdUseCase,
  DeclineInvitationUseCase,
  DissolveHouseholdUseCase,
  GetHouseholdUseCase,
  InviteToHouseholdUseCase,
  LeaveHouseholdUseCase,
  ListReceivedInvitationsUseCase,
  RemoveMemberUseCase,
  ResendInvitationUseCase,
  RevokeInvitationUseCase,
  SetDaySharingUseCase,
} from '@/modules/household/application'
import { HttpHouseholdGateway } from '@/modules/household/infrastructure/HttpHouseholdGateway'

import { MemberDaysReader } from './household/memberDays'
import { HttpSyncGateway } from './sync/HttpSyncGateway'
import { IndexedDbReplica } from './sync/IndexedDbReplica'
import { SyncEngine } from './sync/SyncEngine'

import {
  AddFoodToMealUseCase,
  SaveMealDraftUseCase,
  ChangeMealEntryQuantityUseCase,
  BrowseCustomFoodsUseCase,
  CreateCustomFoodUseCase,
  DeleteFoodUseCase,
  GetFoodUseCase,
  UpdateCustomFoodUseCase,
  DeleteMealUseCase,
  ExportInventoryUseCase,
  FindFoodUseCase,
  GetConsumptionHistoryUseCase,
  GetDailyJournalUseCase,
  GetMealUseCase,
  GetRecentPortionsUseCase,
  GetWeekPlanUseCase,
  MarkMealConsumedUseCase,
  PlanMealForMembersUseCase,
  RefreshPlannedMealsUseCase,
  RescalePlannedMealsUseCase,
  RemoveMealEntryUseCase,
  RescheduleMealUseCase,
  AddRecipeToMealUseCase,
  ChangeRecipeLineQuantityUseCase,
  DeleteRecipeUseCase,
  GetRecipeUseCase,
  ListRecipesUseCase,
  RemoveRecipeLineUseCase,
  RenameRecipeUseCase,
  SaveMealAsRecipeUseCase,
  AddFavoritePortionUseCase,
  ListFavoritePortionsUseCase,
  RemoveFavoritePortionUseCase,
} from '@/modules/nutrition_inventory/application'
import { CiqualSeeder } from '@/modules/nutrition_inventory/infrastructure/CiqualSeeder'
import { IndexedDbFavoritePortionRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFavoritePortionRepository'
import { IndexedDbFoodRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbFoodRepository'
import { IndexedDbMealRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbMealRepository'
import { IndexedDbRecipeRepository } from '@/modules/nutrition_inventory/infrastructure/IndexedDbRecipeRepository'
import { OpenFoodFactsProvider } from '@/modules/nutrition_inventory/infrastructure/OpenFoodFactsProvider'
import { OutboxMealOffers } from '@/modules/nutrition_inventory/infrastructure/OutboxMealOffers'

import {
  AddFoodToShoppingListUseCase,
  AddShoppingItemUseCase,
  CheckShoppingItemUseCase,
  FillShoppingListUseCase,
  GetShoppingListUseCase,
  RemoveShoppingItemsUseCase,
} from '@/modules/shopping/application'
import { IndexedDbShoppingRepository } from '@/modules/shopping/infrastructure/IndexedDbShoppingRepository'

import {
  SuggestMealCompletionUseCase,
  SummarizeRecentIntakeUseCase,
} from '@/modules/planning/application'

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
 */
export interface AppContainer {
  readonly network: INetworkStatus
  readonly databases: DatabaseProvider
  /** Synchronisation différée avec le compte connecté ; inerte sans compte. */
  readonly sync: SyncEngine
  /** Journées des autres membres du foyer, lues en ligne et jamais stockées. */
  readonly memberDays: MemberDaysReader

  readonly account: {
    readonly getSession: GetSessionUseCase
    readonly signUp: SignUpUseCase
    readonly verifyEmail: VerifyEmailUseCase
    readonly signIn: SignInUseCase
    readonly signOut: SignOutUseCase
    readonly requestPasswordReset: RequestPasswordResetUseCase
    readonly resetPassword: ResetPasswordUseCase
    readonly linkPlayer: LinkPlayerUseCase
    readonly deleteAccount: DeleteAccountUseCase
  }
  /** Le foyer n'existe qu'en ligne : aucun de ces use cases ne touche l'appareil. */
  readonly household: {
    readonly get: GetHouseholdUseCase
    readonly create: CreateHouseholdUseCase
    readonly invite: InviteToHouseholdUseCase
    readonly resend: ResendInvitationUseCase
    readonly revoke: RevokeInvitationUseCase
    readonly removeMember: RemoveMemberUseCase
    readonly setDaySharing: SetDaySharingUseCase
    readonly leave: LeaveHouseholdUseCase
    readonly dissolve: DissolveHouseholdUseCase
    readonly receivedInvitations: ListReceivedInvitationsUseCase
    readonly accept: AcceptInvitationUseCase
    readonly decline: DeclineInvitationUseCase
  }
  readonly profile: {
    readonly create: CreatePlayerProfileUseCase
    readonly getCurrent: GetCurrentPlayerUseCase
    readonly update: UpdatePlayerProfileUseCase
  }
  readonly inventory: {
    readonly find: FindFoodUseCase
    readonly createCustomFood: CreateCustomFoodUseCase
    readonly updateCustomFood: UpdateCustomFoodUseCase
    readonly deleteFood: DeleteFoodUseCase
    readonly getFood: GetFoodUseCase
    readonly browseCustomFoods: BrowseCustomFoodsUseCase
    readonly addFood: AddFoodToMealUseCase
    readonly removeEntry: RemoveMealEntryUseCase
    readonly changeQuantity: ChangeMealEntryQuantityUseCase
    readonly reschedule: RescheduleMealUseCase
    readonly saveDraft: SaveMealDraftUseCase
    readonly markConsumed: MarkMealConsumedUseCase
    readonly planForMembers: PlanMealForMembersUseCase
    readonly deleteMeal: DeleteMealUseCase
    readonly getMeal: GetMealUseCase
    readonly recentPortions: GetRecentPortionsUseCase
    readonly refreshPlanned: RefreshPlannedMealsUseCase
    readonly rescalePlanned: RescalePlannedMealsUseCase
    readonly journal: GetDailyJournalUseCase
    readonly week: GetWeekPlanUseCase
    readonly history: GetConsumptionHistoryUseCase
    readonly exportData: ExportInventoryUseCase
    readonly listRecipes: ListRecipesUseCase
    readonly saveAsRecipe: SaveMealAsRecipeUseCase
    readonly getRecipe: GetRecipeUseCase
    readonly renameRecipe: RenameRecipeUseCase
    readonly changeRecipeLine: ChangeRecipeLineQuantityUseCase
    readonly removeRecipeLine: RemoveRecipeLineUseCase
    readonly deleteRecipe: DeleteRecipeUseCase
    readonly addRecipe: AddRecipeToMealUseCase
    readonly listFavoritePortions: ListFavoritePortionsUseCase
    readonly addFavoritePortion: AddFavoritePortionUseCase
    readonly removeFavoritePortion: RemoveFavoritePortionUseCase
  }
  readonly planning: {
    readonly suggestCompletion: SuggestMealCompletionUseCase
    readonly recentIntake: SummarizeRecentIntakeUseCase
  }
  /** Liste de courses, commune au foyer (ou personnelle sans foyer). */
  readonly shopping: {
    readonly get: GetShoppingListUseCase
    readonly fill: FillShoppingListUseCase
    readonly add: AddShoppingItemUseCase
    readonly addFood: AddFoodToShoppingListUseCase
    readonly check: CheckShoppingItemUseCase
    readonly remove: RemoveShoppingItemsUseCase
  }

  /** Amorce le catalogue local. À appeler une fois au démarrage. */
  seedCatalog(): Promise<Result<unknown, Error>>
  dispose(): Promise<void>
}

export function createContainer(
  options: { network?: INetworkStatus } = {},
): AppContainer {
  const network = options.network ?? new BrowserNetworkStatus()
  const databases = new DatabaseProvider()

  const playerRepository = new IndexedDbPlayerRepository(databases)
  const foodRepository = new IndexedDbFoodRepository(databases)
  const mealRepository = new IndexedDbMealRepository(databases)
  const recipeRepository = new IndexedDbRecipeRepository(databases)
  const favoritePortionRepository = new IndexedDbFavoritePortionRepository(databases)
  const shoppingRepository = new IndexedDbShoppingRepository(databases)

  const accountGateway = new HttpAccountGateway()
  const householdGateway = new HttpHouseholdGateway()
  const remoteCatalog = new OpenFoodFactsProvider(network)
  const seeder = new CiqualSeeder(databases, foodRepository)

  return {
    network,
    databases,
    sync: new SyncEngine(new IndexedDbReplica(databases), new HttpSyncGateway(), network),
    memberDays: new MemberDaysReader(),

    account: {
      getSession: new GetSessionUseCase(accountGateway),
      signUp: new SignUpUseCase(accountGateway),
      verifyEmail: new VerifyEmailUseCase(accountGateway),
      signIn: new SignInUseCase(accountGateway),
      signOut: new SignOutUseCase(accountGateway),
      requestPasswordReset: new RequestPasswordResetUseCase(accountGateway),
      resetPassword: new ResetPasswordUseCase(accountGateway),
      linkPlayer: new LinkPlayerUseCase(accountGateway),
      deleteAccount: new DeleteAccountUseCase(accountGateway),
    },
    household: {
      get: new GetHouseholdUseCase(householdGateway),
      create: new CreateHouseholdUseCase(householdGateway),
      invite: new InviteToHouseholdUseCase(householdGateway),
      resend: new ResendInvitationUseCase(householdGateway),
      revoke: new RevokeInvitationUseCase(householdGateway),
      removeMember: new RemoveMemberUseCase(householdGateway),
      setDaySharing: new SetDaySharingUseCase(householdGateway),
      leave: new LeaveHouseholdUseCase(householdGateway),
      dissolve: new DissolveHouseholdUseCase(householdGateway),
      receivedInvitations: new ListReceivedInvitationsUseCase(householdGateway),
      accept: new AcceptInvitationUseCase(householdGateway),
      decline: new DeclineInvitationUseCase(householdGateway),
    },
    profile: {
      create: new CreatePlayerProfileUseCase(playerRepository),
      getCurrent: new GetCurrentPlayerUseCase(playerRepository),
      update: new UpdatePlayerProfileUseCase(playerRepository),
    },
    inventory: {
      find: new FindFoodUseCase(foodRepository, remoteCatalog, network),
      createCustomFood: new CreateCustomFoodUseCase(foodRepository),
      updateCustomFood: new UpdateCustomFoodUseCase(foodRepository),
      deleteFood: new DeleteFoodUseCase(foodRepository),
      getFood: new GetFoodUseCase(foodRepository),
      browseCustomFoods: new BrowseCustomFoodsUseCase(foodRepository),
      addFood: new AddFoodToMealUseCase(foodRepository, mealRepository),
      removeEntry: new RemoveMealEntryUseCase(mealRepository),
      changeQuantity: new ChangeMealEntryQuantityUseCase(mealRepository),
      reschedule: new RescheduleMealUseCase(mealRepository),
      saveDraft: new SaveMealDraftUseCase(foodRepository, mealRepository),
      markConsumed: new MarkMealConsumedUseCase(mealRepository),
      planForMembers: new PlanMealForMembersUseCase(mealRepository, new OutboxMealOffers(databases), foodRepository),
      deleteMeal: new DeleteMealUseCase(mealRepository),
      getMeal: new GetMealUseCase(mealRepository),
      recentPortions: new GetRecentPortionsUseCase(mealRepository),
      refreshPlanned: new RefreshPlannedMealsUseCase(mealRepository, foodRepository),
      rescalePlanned: new RescalePlannedMealsUseCase(mealRepository),
      journal: new GetDailyJournalUseCase(mealRepository),
      week: new GetWeekPlanUseCase(mealRepository),
      history: new GetConsumptionHistoryUseCase(mealRepository),
      exportData: new ExportInventoryUseCase(mealRepository, foodRepository),
      listRecipes: new ListRecipesUseCase(recipeRepository),
      saveAsRecipe: new SaveMealAsRecipeUseCase(mealRepository, recipeRepository),
      getRecipe: new GetRecipeUseCase(recipeRepository),
      renameRecipe: new RenameRecipeUseCase(recipeRepository),
      changeRecipeLine: new ChangeRecipeLineQuantityUseCase(recipeRepository),
      removeRecipeLine: new RemoveRecipeLineUseCase(recipeRepository),
      deleteRecipe: new DeleteRecipeUseCase(recipeRepository),
      addRecipe: new AddRecipeToMealUseCase(recipeRepository, foodRepository, mealRepository),
      listFavoritePortions: new ListFavoritePortionsUseCase(favoritePortionRepository),
      addFavoritePortion: new AddFavoritePortionUseCase(favoritePortionRepository),
      removeFavoritePortion: new RemoveFavoritePortionUseCase(favoritePortionRepository),
    },
    planning: {
      suggestCompletion: new SuggestMealCompletionUseCase(),
      recentIntake: new SummarizeRecentIntakeUseCase(),
    },
    shopping: {
      get: new GetShoppingListUseCase(shoppingRepository),
      fill: new FillShoppingListUseCase(shoppingRepository),
      add: new AddShoppingItemUseCase(shoppingRepository),
      addFood: new AddFoodToShoppingListUseCase(shoppingRepository),
      check: new CheckShoppingItemUseCase(shoppingRepository),
      remove: new RemoveShoppingItemsUseCase(shoppingRepository),
    },

    seedCatalog: () => seeder.seedIfNeeded(),

    async dispose() {
      await databases.close()
    },
  }
}
