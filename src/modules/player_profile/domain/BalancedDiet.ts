/**
 * Répartition de référence des macronutriments.
 *
 * L'application n'a pas d'objectif de transformation corporelle : elle apprend à
 * manger équilibré. Il n'existe donc **qu'une seule** répartition cible, la même
 * pour tout le monde, et la cible calorique est la dépense énergétique — ni
 * déficit, ni surplus.
 *
 * Les valeurs suivent les références nutritionnelles de l'ANSES, exprimées en
 * part de l'apport énergétique total : protéines 10–20 %, lipides 35–40 %,
 * glucides 40–55 %. Le milieu de chaque fourchette est retenu ici, ajusté pour
 * que la somme fasse exactement 1 — un test le verrouille.
 *
 * Exprimer la cible en part des calories, et non directement en grammes, est ce
 * qui permet de la convertir sans ambiguïté via les coefficients d'Atwater.
 */
export interface MacroSplit {
  readonly protein: number
  readonly carbs: number
  readonly fat: number
}

export const BALANCED_MACRO_SPLIT: MacroSplit = {
  protein: 0.17,
  carbs: 0.48,
  fat: 0.35,
}

/**
 * Repères quotidiens des quatre nutriments déclarés au-delà du triplet
 * énergétique. Deux lectures s'y mêlent, et la distinction est essentielle :
 *
 * - les **fibres** sont un apport à atteindre ;
 * - les **sucres**, les **acides gras saturés** et le **sel** sont des plafonds
 *   à ne pas dépasser.
 *
 * Une jauge qui traiterait les quatre de la même façon féliciterait l'usager
 * d'avoir atteint sa « cible » de sel. Le domaine sépare donc les deux notions,
 * et la couche présentation les rend visuellement distinctes.
 */

/** Apport satisfaisant ANSES en fibres pour l'adulte : 30 g/jour. */
export const DAILY_FIBER_TARGET_G = 30

/**
 * Plafond ANSES pour les sucres totaux hors lactose et galactose : 100 g/jour.
 *
 * Approximation assumée : Ciqual publie les sucres **totaux**, lactose compris.
 * Le repère est donc appliqué à une valeur légèrement supérieure à celle qu'il
 * vise, ce qui le rend un peu sévère pour les gros consommateurs de produits
 * laitiers — jamais laxiste, ce qui est le bon sens de l'erreur pour un plafond.
 */
export const DAILY_SUGARS_LIMIT_G = 100

/** Repère PNNS, aligné sur l'OMS : moins de 5 g de sel par jour. */
export const DAILY_SALT_LIMIT_G = 5

/**
 * Plafond ANSES des acides gras saturés : 12 % de l'apport énergétique.
 *
 * Seul repère des quatre à dépendre de la dépense énergétique, donc le seul qui
 * varie d'un profil à l'autre.
 */
export const SATURATED_FAT_ENERGY_SHARE = 0.12
