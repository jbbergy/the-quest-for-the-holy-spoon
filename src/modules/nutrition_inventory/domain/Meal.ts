import { type DayKey, dayKeyOf } from '@/core/day'
import { DomainError, InvalidMealError } from '@/core/errors'
import { type MealId, newId, type PlayerId } from '@/core/identity'
import { Macros } from '@/core/nutrition/Macros'
import { NutrientDetail } from '@/core/nutrition/NutrientDetail'
import type { Quantity } from '@/core/nutrition/Quantity'
import { err, ok, type Result } from '@/core/result'

import { MealEntry } from './MealEntry'

export const MealType = {
  BREAKFAST: 'BREAKFAST',
  LUNCH: 'LUNCH',
  DINNER: 'DINNER',
  SNACK: 'SNACK',
} as const
export type MealType = (typeof MealType)[keyof typeof MealType]

export interface MealTotals {
  readonly macros: Macros
  readonly detail: NutrientDetail
  readonly calories: number
}

export interface MealProps {
  readonly id: MealId
  readonly playerId: PlayerId
  readonly type: MealType
  readonly loggedAt: Date
  /** Jour pour lequel le repas est prévu — celui où il compte, pas celui où on l'a composé. */
  readonly plannedFor: DayKey
  readonly entries: readonly MealEntry[]
  /** Date de consommation réelle, ou `null` tant que le repas n'est que prévu. */
  readonly consumedAt: Date | null
}

const MAX_ENTRIES = 100

/**
 * Racine d'agrégat : un repas et ses lignes.
 *
 * Immuable — chaque modification retourne un nouveau `Meal`, ce qui permet aux
 * `ref` Vue d'être réassignées et donc aux watchers (et à GSAP) de se déclencher
 * de façon prévisible, sans wrapper l'entité dans `reactive()`.
 *
 * Un repas porte **trois repères distincts** :
 * - `loggedAt`, quand il a été composé ;
 * - `plannedFor`, le jour auquel il appartient — composer dimanche le dîner de
 *   jeudi le range jeudi, c'est tout l'objet de la planification ;
 * - `consumedAt`, quand il a effectivement été mangé. Seul ce dernier fait
 *   entrer ses apports dans les totaux — composer un repas à l'avance ne doit
 *   pas remplir les jauges de quelqu'un qui n'a encore rien mangé.
 */
export class Meal {
  private constructor(
    readonly id: MealId,
    readonly playerId: PlayerId,
    readonly type: MealType,
    readonly loggedAt: Date,
    readonly plannedFor: DayKey,
    readonly entries: readonly MealEntry[],
    readonly consumedAt: Date | null,
  ) {}

  static create(props: {
    readonly playerId: PlayerId
    readonly type: MealType
    readonly loggedAt?: Date
    /** Par défaut, le jour où le repas est composé. */
    readonly plannedFor?: DayKey
    readonly entries?: readonly MealEntry[]
    readonly id?: MealId
  }): Result<Meal, InvalidMealError> {
    const entries = props.entries ?? []
    if (entries.length > MAX_ENTRIES) {
      return err(new InvalidMealError(`Un repas ne peut pas dépasser ${MAX_ENTRIES} lignes.`))
    }

    const loggedAt = props.loggedAt ?? new Date()
    if (Number.isNaN(loggedAt.getTime())) {
      return err(new InvalidMealError('La date du repas est invalide.'))
    }

    // Un repas naît toujours « prévu » : c'est `markConsumed` qui le fait
    // compter. Pouvoir le créer déjà pris rouvrirait la porte à l'oubli que
    // cette distinction vient précisément fermer.
    return ok(
      new Meal(
        props.id ?? newId<'MealId'>(),
        props.playerId,
        props.type,
        new Date(loggedAt.getTime()),
        props.plannedFor ?? dayKeyOf(loggedAt),
        Object.freeze([...entries]),
        null,
      ),
    )
  }

  static reconstitute(props: MealProps): Meal {
    return new Meal(
      props.id,
      props.playerId,
      props.type,
      props.loggedAt,
      props.plannedFor,
      Object.freeze([...props.entries]),
      props.consumedAt,
    )
  }

  get isEmpty(): boolean {
    return this.entries.length === 0
  }

  get isConsumed(): boolean {
    return this.consumedAt !== null
  }

  get entryCount(): number {
    return this.entries.length
  }

  /**
   * Totaux du repas, calculés **exclusivement à partir des instantanés** des lignes.
   * Le catalogue n'est jamais consulté ici : un repas d'il y a six mois garde ses
   * chiffres même si la fiche de l'aliment a été corrigée depuis.
   */
  calculateTotals(): MealTotals {
    const macros = this.entries.reduce((sum, entry) => sum.plus(entry.macros), Macros.zero())
    const detail = this.entries.reduce(
      (sum, entry) => sum.plus(entry.detail),
      NutrientDetail.zero(),
    )
    // Les calories ne tiennent compte que des macros : sucres et AG saturés sont
    // déjà comptés dans les glucides et les lipides, le sel n'apporte rien, et
    // les fibres sont hors du calcul d'Atwater retenu par le projet.
    return { macros, detail, calories: macros.calories() }
  }

  addEntry(entry: MealEntry): Result<Meal, InvalidMealError> {
    const locked = this.editingRefusal()
    if (locked !== null) return err(locked)

    if (this.entries.length >= MAX_ENTRIES) {
      return err(new InvalidMealError(`Un repas ne peut pas dépasser ${MAX_ENTRIES} lignes.`))
    }
    if (this.entries.some((existing) => existing.equals(entry))) {
      return err(new InvalidMealError(`La ligne ${entry.id} est déjà présente dans ce repas.`))
    }
    return ok(this.withEntries([...this.entries, entry]))
  }

  removeEntry(entryId: MealEntry['id']): Result<Meal, InvalidMealError> {
    const locked = this.editingRefusal()
    if (locked !== null) return err(locked)

    const remaining = this.entries.filter((entry) => entry.id !== entryId)
    if (remaining.length === this.entries.length) {
      return err(new InvalidMealError(`Aucune ligne ${entryId} dans ce repas.`))
    }
    return ok(this.withEntries(remaining))
  }

  changeEntryQuantity(
    entryId: MealEntry['id'],
    quantity: Quantity,
  ): Result<Meal, DomainError> {
    const locked = this.editingRefusal()
    if (locked !== null) return err(locked)

    const index = this.entries.findIndex((entry) => entry.id === entryId)
    const target = this.entries[index]
    if (target === undefined) {
      return err(new InvalidMealError(`Aucune ligne ${entryId} dans ce repas.`))
    }

    const updated = target.withQuantity(quantity)
    if (!updated.ok) return err(updated.error)

    const entries = [...this.entries]
    entries[index] = updated.value
    return ok(this.withEntries(entries))
  }

  retype(type: MealType): Meal {
    return new Meal(
      this.id,
      this.playerId,
      type,
      this.loggedAt,
      this.plannedFor,
      this.entries,
      this.consumedAt,
    )
  }

  /**
   * Déplace le repas à un autre jour.
   *
   * Refusé une fois le repas pris, pour la même raison que toute autre
   * modification : ses apports sont entrés dans les totaux d'une journée, et les
   * transporter ailleurs réécrirait deux journées d'un coup.
   */
  reschedule(plannedFor: DayKey): Result<Meal, InvalidMealError> {
    const locked = this.editingRefusal()
    if (locked !== null) return err(locked)

    return ok(
      new Meal(
        this.id,
        this.playerId,
        this.type,
        this.loggedAt,
        plannedFor,
        this.entries,
        this.consumedAt,
      ),
    )
  }

  /**
   * Déclare le repas effectivement pris : ses apports entrent alors dans les
   * totaux du jour.
   *
   * Refuser le second marquage n'est pas du zèle — c'est ce qui permet à
   * l'appelant de distinguer « rien à faire » d'un vrai changement d'état.
   */
  markConsumed(at: Date = new Date()): Result<Meal, InvalidMealError> {
    if (this.isEmpty) {
      return err(new InvalidMealError('Un repas vide ne peut pas être marqué comme pris.'))
    }
    if (this.isConsumed) {
      return err(new InvalidMealError('Ce repas est déjà marqué comme pris.'))
    }
    if (Number.isNaN(at.getTime())) {
      return err(new InvalidMealError('La date de consommation est invalide.'))
    }
    // Un repas de demain déclaré pris aujourd'hui compterait dans une journée qui
    // n'a pas encore eu lieu. Un repas passé, lui, peut l'être après coup : c'est
    // le dîner d'hier qu'on a oublié de cocher.
    if (this.plannedFor > dayKeyOf(at)) {
      return err(
        new InvalidMealError('Un repas prévu pour un jour à venir ne peut pas encore être pris.'),
      )
    }

    return ok(this.withConsumedAt(new Date(at.getTime())))
  }

  /** Annule le marquage : le repas redevient prévu et ressort des totaux. */
  markNotConsumed(): Result<Meal, InvalidMealError> {
    if (!this.isConsumed) {
      return err(new InvalidMealError('Ce repas n’est pas marqué comme pris.'))
    }
    return ok(this.withConsumedAt(null))
  }

  /**
   * Refus opposé à toute modification du contenu d'un repas déjà pris.
   *
   * Un repas pris est un **fait révolu** : ses apports sont entrés dans les
   * jauges du jour, et l'assistant a fondé sa recommandation dessus. Le corriger
   * sur place réécrirait silencieusement une journée déjà vécue — exactement ce
   * que l'instantané figé de `MealEntry` interdit pour le catalogue, et qui n'a
   * pas plus de sens venant de l'utilisateur.
   *
   * La correction reste possible, mais par un geste explicite : décocher
   * « pris », modifier, recocher. Le détour est le propos, il rend visible qu'on
   * touche à l'histoire de la journée.
   */
  private editingRefusal(): InvalidMealError | null {
    return this.isConsumed
      ? new InvalidMealError(
          'Un repas déjà pris ne peut plus être modifié. Décochez « pris » pour le corriger.',
        )
      : null
  }

  private withConsumedAt(consumedAt: Date | null): Meal {
    return new Meal(
      this.id,
      this.playerId,
      this.type,
      this.loggedAt,
      this.plannedFor,
      this.entries,
      consumedAt,
    )
  }

  /**
   * Remplace les lignes en conservant l'état de consommation.
   *
   * Cette méthode remettait `consumedAt` à `null` quand le repas se vidait, pour
   * qu'un repas « vide et mangé » ne puisse pas naître d'un retrait de ligne.
   * La garde `editingRefusal` rend ce détour sans objet : les trois seuls
   * chemins qui mènent ici refusent désormais un repas pris. L'état reste donc
   * inatteignable — `markConsumed` refuse un repas vide, et un repas pris refuse
   * de se vider — mais par une barrière unique plutôt que deux, dont l'une
   * n'aurait plus jamais été franchie.
   */
  private withEntries(entries: readonly MealEntry[]): Meal {
    return new Meal(
      this.id,
      this.playerId,
      this.type,
      this.loggedAt,
      this.plannedFor,
      Object.freeze([...entries]),
      this.consumedAt,
    )
  }
}
