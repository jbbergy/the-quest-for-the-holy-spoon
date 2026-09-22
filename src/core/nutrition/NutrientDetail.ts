import { InvalidNutrientsError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

export interface NutrientDetailProps {
  readonly fiberG: number
  readonly sugarsG: number
  readonly saturatedFatG: number
  readonly saltG: number
}

const LABELS: Readonly<Record<keyof NutrientDetailProps, string>> = {
  fiberG: 'fibres',
  sugarsG: 'sucres',
  saturatedFatG: 'acides gras saturés',
  saltG: 'sel',
}

/**
 * Les quatre nutriments déclarés par le règlement UE 1169/2011 au-delà du
 * triplet énergétique, en grammes.
 *
 * **Pourquoi un VO distinct de `Macros`** : `Macros` est le triplet qui *porte
 * l'énergie*, et sa méthode `calories()` applique les coefficients d'Atwater.
 * Le sel n'est pas un macronutriment et n'apporte aucune calorie ; les sucres et
 * les acides gras saturés, eux, sont déjà comptés dans les glucides et les
 * lipides — les verser dans `Macros` doublerait l'énergie du repas. Ce sont donc
 * des axes de lecture, pas des composantes du calcul.
 *
 * Les fibres n'en font pas exception : dans Ciqual comme sur les étiquettes
 * européennes, « glucides » désigne les glucides *assimilables* et exclut déjà
 * les fibres. Les ajouter ici ne redécoupe rien.
 *
 * **Aucun invariant d'inclusion n'est vérifié** (sucres ≤ glucides, AG saturés ≤
 * lipides). Ce n'est pas un oubli : sur les 3 178 fiches du catalogue, 46
 * déclarent des sucres supérieurs aux glucides et 3 des AG saturés supérieurs
 * aux lipides — d'au plus 0,6 g, effet des arrondis et de méthodes analytiques
 * distinctes. Imposer la règle rejetterait 49 fiches parfaitement légitimes de
 * l'ANSES pour une incohérence sans portée nutritionnelle.
 */
export class NutrientDetail {
  private constructor(
    readonly fiberG: number,
    readonly sugarsG: number,
    readonly saturatedFatG: number,
    readonly saltG: number,
  ) {}

  static create(props: NutrientDetailProps): Result<NutrientDetail, InvalidNutrientsError> {
    for (const key of Object.keys(LABELS) as (keyof NutrientDetailProps)[]) {
      const value = props[key]
      if (!Number.isFinite(value)) {
        return err(new InvalidNutrientsError(`Les ${LABELS[key]} doivent être un nombre fini.`))
      }
      if (value < 0) {
        return err(
          new InvalidNutrientsError(
            `Les ${LABELS[key]} ne peuvent pas être négatifs (reçu ${value}).`,
          ),
        )
      }
    }

    return ok(
      new NutrientDetail(props.fiberG, props.sugarsG, props.saturatedFatG, props.saltG),
    )
  }

  static reconstitute(props: NutrientDetailProps): NutrientDetail {
    return new NutrientDetail(props.fiberG, props.sugarsG, props.saturatedFatG, props.saltG)
  }

  static zero(): NutrientDetail {
    return new NutrientDetail(0, 0, 0, 0)
  }

  /** Mise à l'échelle, par exemple d'une base 100 g vers une portion réelle. */
  scale(factor: number): Result<NutrientDetail, InvalidNutrientsError> {
    if (!Number.isFinite(factor) || factor < 0) {
      return err(new InvalidNutrientsError(`Facteur d’échelle invalide : ${factor}.`))
    }
    return ok(
      new NutrientDetail(
        this.fiberG * factor,
        this.sugarsG * factor,
        this.saturatedFatG * factor,
        this.saltG * factor,
      ),
    )
  }

  plus(other: NutrientDetail): NutrientDetail {
    return new NutrientDetail(
      this.fiberG + other.fiberG,
      this.sugarsG + other.sugarsG,
      this.saturatedFatG + other.saturatedFatG,
      this.saltG + other.saltG,
    )
  }

  /** Soustraction bornée à zéro, comme `Macros.minus` : un reste négatif n'a pas de sens. */
  minus(other: NutrientDetail): NutrientDetail {
    return new NutrientDetail(
      Math.max(0, this.fiberG - other.fiberG),
      Math.max(0, this.sugarsG - other.sugarsG),
      Math.max(0, this.saturatedFatG - other.saturatedFatG),
      Math.max(0, this.saltG - other.saltG),
    )
  }

  isZero(): boolean {
    return (
      this.fiberG === 0 && this.sugarsG === 0 && this.saturatedFatG === 0 && this.saltG === 0
    )
  }

  equals(other: NutrientDetail): boolean {
    return (
      this.fiberG === other.fiberG &&
      this.sugarsG === other.sugarsG &&
      this.saturatedFatG === other.saturatedFatG &&
      this.saltG === other.saltG
    )
  }

  toJSON(): NutrientDetailProps {
    return {
      fiberG: this.fiberG,
      sugarsG: this.sugarsG,
      saturatedFatG: this.saturatedFatG,
      saltG: this.saltG,
    }
  }
}
