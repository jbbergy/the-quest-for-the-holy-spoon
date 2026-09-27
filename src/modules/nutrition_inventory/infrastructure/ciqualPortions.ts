import type { FoodPortions } from '../domain/FoodItem'
import { BaseUnit, type Serving } from '../domain/Measure'

/**
 * Portions usuelles des aliments Ciqual.
 *
 * Ciqual ne publie que des valeurs pour 100 g : ni portion, ni densité. Cette
 * table les complète à la main, d'après des tailles courantes (un œuf moyen,
 * une tranche de pain de mie, un pot de yaourt, une cuillère à soupe d'huile).
 * Ce sont des **moyennes** : l'écran les affiche précédées de « ≈ », et la
 * saisie en grammes reste toujours possible.
 *
 * Une règle vaut pour un ou plusieurs sous-groupes Ciqual, éventuellement
 * restreinte aux noms qui correspondent à un motif. La première règle qui
 * s'applique l'emporte : les règles par nom précèdent donc celle, générale, de
 * leur sous-groupe. Un aliment qu'aucune règle ne couvre reste en grammes, sans
 * portion — mieux vaut pas de suggestion qu'une suggestion fausse. Une règle
 * sans portion sert précisément à écarter un nom de la règle générale.
 */
interface PortionRule {
  readonly subGroups: readonly string[]
  /** Motif testé sur le nom en minuscules ; absent, la règle vaut pour tout le sous-groupe. */
  readonly name?: RegExp
  /** Liquide : les portions sont alors données en millilitres. */
  readonly liquid?: { readonly density: number }
  readonly servings: readonly (readonly [label: string, amount: number])[]
}

const WATER = { density: 1 }
const MILK = { density: 1.03 }
const OIL = { density: 0.92 }
const SYRUP = { density: 1.3 }

const RULES: readonly PortionRule[] = [
  // Entrées et plats composés
  { subGroups: ['0101'], servings: [['assiette', 200]] },
  { subGroups: ['0102'], liquid: WATER, servings: [['bol', 250], ['assiette', 300]] },
  { subGroups: ['0103'], servings: [['assiette', 300]] },
  { subGroups: ['0104'], name: /^pizza/, servings: [['part', 120], ['pizza', 450]] },
  { subGroups: ['0104'], servings: [['part', 120]] },
  { subGroups: ['0105'], name: /burger/, servings: [['burger', 130]] },
  { subGroups: ['0105'], name: /^croque/, servings: [['croque', 150]] },
  { subGroups: ['0105'], name: /^sandwich/, servings: [['sandwich', 250]] },
  { subGroups: ['0105'], servings: [['pièce', 200]] },
  { subGroups: ['0106'], servings: [['part', 100]] },

  // Légumes, pommes de terre, légumineuses
  { subGroups: ['0201'], name: /^tomate\b.*\bcrue/, servings: [['tomate', 120], ['portion', 150]] },
  { subGroups: ['0201'], name: /^carotte\b.*\bcrue/, servings: [['carotte', 100], ['portion', 150]] },
  { subGroups: ['0201'], servings: [['portion', 150]] },
  { subGroups: ['0202'], name: /chips/, servings: [['poignée', 25]] },
  { subGroups: ['0202'], name: /flocons/, servings: [] },
  { subGroups: ['0202'], name: /frite|dauphine|duchesse|noisette|sauté|poêlé|rissolé/, servings: [['portion', 150]] },
  { subGroups: ['0202'], name: /purée/, servings: [['portion', 200]] },
  { subGroups: ['0202'], name: /^pomme de terre/, servings: [['pomme de terre', 100]] },
  { subGroups: ['0203'], name: /cuit|appertis/, servings: [['c. à soupe', 25], ['portion', 150]] },
  { subGroups: ['0203'], servings: [['portion', 60]] },

  // Fruits
  { subGroups: ['0204'], name: /^pomme\b(?! (cajou|cannelle|d'eau|liane)).*\bcrue/, servings: [['pomme', 150]] },
  { subGroups: ['0204'], name: /^poire\b.*\bcrue/, servings: [['poire', 150]] },
  { subGroups: ['0204'], name: /^banane, pulpe, crue/, servings: [['banane', 120]] },
  { subGroups: ['0204'], name: /^orange\b.*\bcrue/, servings: [['orange', 140]] },
  { subGroups: ['0204'], name: /^(clémentine|mandarine)\b.*\bcrue/, servings: [['clémentine', 60]] },
  { subGroups: ['0204'], name: /^kiwi\b/, servings: [['kiwi', 75]] },
  { subGroups: ['0204'], name: /^(pêche|nectarine|brugnon)\b.*\bcrue/, servings: [['pêche', 130]] },
  { subGroups: ['0204'], name: /^abricot, dénoyauté, cru/, servings: [['abricot', 45]] },
  { subGroups: ['0204'], name: /^abricot, dénoyauté, sec/, servings: [['abricot sec', 8]] },
  { subGroups: ['0204'], name: /^prune\b.*\bcrue/, servings: [['prune', 35]] },
  { subGroups: ['0204'], name: /^pruneau/, servings: [['pruneau', 10]] },
  { subGroups: ['0204'], name: /^figue, crue/, servings: [['figue', 50]] },
  { subGroups: ['0204'], name: /^datte/, servings: [['datte', 8]] },
  { subGroups: ['0204'], name: /^(fraise|framboise|myrtille|cerise|groseille|mûre|cassis|fruits rouges)/, servings: [['bol', 125]] },
  { subGroups: ['0204'], name: /^raisin\b.*\bcru/, servings: [['grappe', 125]] },
  { subGroups: ['0204'], name: /^(melon|pastèque)\b/, servings: [['tranche', 150]] },
  { subGroups: ['0204'], name: /^ananas, pulpe/, servings: [['tranche', 80]] },
  { subGroups: ['0204'], name: /^avocat/, servings: [['avocat', 150]] },
  { subGroups: ['0204'], name: /^(compote|dessert de fruits)/, servings: [['pot', 100]] },

  // Fruits à coque et graines
  { subGroups: ['0205'], name: /beurre|purée|pâte/, servings: [['c. à soupe', 15]] },
  { subGroups: ['0205'], servings: [['poignée', 30]] },

  // Produits céréaliers
  { subGroups: ['0301'], name: /cuit|bouilli/, servings: [['assiette', 200]] },
  { subGroups: ['0301'], servings: [['portion', 70]] },
  { subGroups: ['0302'], name: /^pain de mie/, servings: [['tranche', 25]] },
  { subGroups: ['0302'], name: /^biscotte/, servings: [['biscotte', 8]] },
  { subGroups: ['0302'], name: /^pain grillé/, servings: [['tranche', 10]] },
  { subGroups: ['0302'], name: /baguette/, servings: [['morceau', 40], ['baguette', 250]] },
  { subGroups: ['0302'], name: /^bagel/, servings: [['bagel', 85]] },
  { subGroups: ['0302'], name: /^muffin anglais/, servings: [['muffin', 60]] },
  { subGroups: ['0302'], name: /^pain pour hamburger/, servings: [['pain', 55]] },
  { subGroups: ['0302'], name: /^pain pita/, servings: [['pita', 60]] },
  { subGroups: ['0302'], name: /^tortilla/, servings: [['tortilla', 40]] },
  { subGroups: ['0302'], name: /^galette/, servings: [['galette', 8]] },
  { subGroups: ['0302'], name: /^blini/, servings: [['blini', 15]] },
  { subGroups: ['0302'], name: /^(croûton|chapelure)/, servings: [['c. à soupe', 5]] },
  { subGroups: ['0302'], name: /^pain/, servings: [['tranche', 30]] },
  { subGroups: ['0303'], servings: [['poignée', 25]] },
  { subGroups: ['0305'], name: /^(farine|amidon|fécule)/, servings: [['c. à soupe', 10]] },
  { subGroups: ['0305', '0707'], name: /^flocon/, servings: [['c. à soupe', 10], ['bol', 40]] },

  // Viandes, poissons, œufs
  { subGroups: ['0402'], name: /steak haché/, servings: [['steak haché', 100]] },
  { subGroups: ['0401', '0402'], name: /escalope/, servings: [['escalope', 120]] },
  { subGroups: ['0401', '0402'], servings: [['portion', 120]] },
  { subGroups: ['0403'], name: /^jambon cru/, servings: [['tranche', 20]] },
  { subGroups: ['0403'], name: /^(jambon|épaule)/, servings: [['tranche', 40]] },
  { subGroups: ['0403'], name: /saucisson|chorizo|salami|coppa|rosette|bresaola/, servings: [['tranche', 6]] },
  { subGroups: ['0403'], name: /^(pâté|terrine|rillettes|mousse|foie gras)/, servings: [['portion', 40]] },
  { subGroups: ['0403'], name: /^(saucisse|chipolata|merguez|diot|cervelas|knack)/, servings: [['saucisse', 60]] },
  { subGroups: ['0403'], name: /bacon/, servings: [['tranche', 10]] },
  { subGroups: ['0405', '0406'], servings: [['portion', 120]] },
  { subGroups: ['0407', '0408'], servings: [['portion', 100]] },
  { subGroups: ['0409'], name: /surimi/, servings: [['bâtonnet', 15]] },
  { subGroups: ['0409'], name: /^sardine/, servings: [['sardine', 25]] },
  { subGroups: ['0409'], name: /^rillettes/, servings: [['c. à soupe', 20]] },
  { subGroups: ['0409'], servings: [['portion', 100]] },
  { subGroups: ['0410'], name: /^oeuf de caille/, servings: [['œuf', 10]] },
  { subGroups: ['0410'], name: /^oeuf, blanc.*\b(cru|cuit)$/, servings: [['blanc', 30]] },
  { subGroups: ['0410'], name: /^oeuf, jaune.*\b(cru|cuit)$/, servings: [['jaune', 18]] },
  { subGroups: ['0410'], name: /^oeuf, (cru|dur|à la coque|poché|au plat|brouillé)/, servings: [['œuf', 50]] },
  { subGroups: ['0410'], name: /^(omelette|tortilla)/, servings: [['part', 150]] },
  { subGroups: ['0411'], servings: [['portion', 100]] },

  // Produits laitiers
  { subGroups: ['0501'], name: /poudre/, servings: [['c. à soupe', 8]] },
  { subGroups: ['0501'], name: /concentré/, servings: [['c. à soupe', 20]] },
  { subGroups: ['0501'], liquid: MILK, servings: [['verre', 200], ['bol', 250]] },
  { subGroups: ['0502'], name: /^boisson lactée/, liquid: MILK, servings: [['petite bouteille', 100]] },
  { subGroups: ['0502'], name: /^petit[- ]suisse/, servings: [['petit-suisse', 60]] },
  { subGroups: ['0502'], name: /^(fromage blanc|faisselle)/, servings: [['pot', 100], ['c. à soupe', 30]] },
  { subGroups: ['0502'], name: /^(cheesecake|clafoutis|fondant|tiramisu)/, servings: [['part', 100]] },
  { subGroups: ['0502'], name: /^flan/, servings: [['part', 100]] },
  { subGroups: ['0502'], servings: [['pot', 125]] },
  { subGroups: ['0503'], name: /râpé/, servings: [['c. à soupe', 10]] },
  { subGroups: ['0503'], name: /^mozzarella/, servings: [['boule', 125], ['tranche', 20]] },
  { subGroups: ['0503'], servings: [['portion', 30]] },
  { subGroups: ['0504'], name: /chantilly/, servings: [['c. à soupe', 5]] },
  { subGroups: ['0504'], servings: [['c. à soupe', 15]] },

  // Boissons
  { subGroups: ['0601'], liquid: WATER, servings: [['verre', 200], ['bouteille', 500]] },
  { subGroups: ['0602'], name: /à diluer|^sirop/, liquid: SYRUP, servings: [['dose', 20]] },
  { subGroups: ['0602'], name: /^(café|thé|infusion|tisane|chicorée)/, liquid: WATER, servings: [['tasse', 150]] },
  { subGroups: ['0602'], name: /cacaotée|chocolat/, liquid: MILK, servings: [['bol', 250]] },
  { subGroups: ['0602'], name: /^(soda|cola|limonade|boisson gazeuse|boisson énergisante|tonic|bitter)/, liquid: WATER, servings: [['verre', 200], ['canette', 330]] },
  { subGroups: ['0602'], liquid: WATER, servings: [['verre', 200]] },
  { subGroups: ['0603'], name: /^(bière|panaché)/, liquid: WATER, servings: [['demi', 250], ['canette', 330]] },
  { subGroups: ['0603'], name: /^(vin|champagne|kir|sangria|apéritif à base de vin|marsala)/, liquid: WATER, servings: [['verre', 120]] },
  { subGroups: ['0603'], name: /^cidre/, liquid: WATER, servings: [['bolée', 200]] },
  { subGroups: ['0603'], name: /prêt à boire|cocktail|pétillant/, liquid: WATER, servings: [['verre', 150]] },
  { subGroups: ['0603'], liquid: WATER, servings: [['verre', 30]] },

  // Produits sucrés
  { subGroups: ['0701'], name: /^sucre/, servings: [['morceau', 5], ['c. à café', 5]] },
  { subGroups: ['0701'], name: /^miel/, servings: [['c. à café', 8], ['c. à soupe', 20]] },
  { subGroups: ['0701'], servings: [['c. à café', 5], ['c. à soupe', 15]] },
  { subGroups: ['0702'], name: /pâte à tartiner/, servings: [['c. à café', 7], ['c. à soupe', 15]] },
  { subGroups: ['0702'], name: /tablette/, servings: [['carré', 5]] },
  { subGroups: ['0702'], name: /^barres?\b/, servings: [['barre', 45]] },
  { subGroups: ['0702'], name: /^(bonbon|bouchée|rocher)/, servings: [['pièce', 12]] },
  { subGroups: ['0702'], name: /dragéifi/, servings: [['poignée', 25]] },
  { subGroups: ['0703'], servings: [['bonbon', 5]] },
  { subGroups: ['0704'], servings: [['c. à café', 7], ['c. à soupe', 20]] },
  { subGroups: ['0705'], name: /^croissant/, servings: [['croissant', 45]] },
  { subGroups: ['0705'], name: /^pain au chocolat/, servings: [['pain au chocolat', 60]] },
  { subGroups: ['0705'], name: /^pain au lait/, servings: [['pain au lait', 35]] },
  { subGroups: ['0705'], name: /^pain aux raisins/, servings: [['pièce', 90]] },
  { subGroups: ['0705'], name: /^chausson/, servings: [['chausson', 90]] },
  { subGroups: ['0705'], name: /^chouquette/, servings: [['chouquette', 10]] },
  { subGroups: ['0705'], name: /brioche|brioché|couronne/, servings: [['tranche', 35]] },
  { subGroups: ['0705'], servings: [['pièce', 50]] },
  { subGroups: ['0706'], name: /^cookie/, servings: [['cookie', 12]] },
  { subGroups: ['0706'], name: /^gaufrette/, servings: [['gaufrette', 8]] },
  { subGroups: ['0706'], name: /^goûter sec fourré/, servings: [['biscuit', 15]] },
  { subGroups: ['0706'], name: /^crêpe dentelle/, servings: [['crêpe dentelle', 6]] },
  { subGroups: ['0706'], name: /^cône/, servings: [['cône', 10]] },
  { subGroups: ['0706'], servings: [['biscuit', 10]] },
  { subGroups: ['0707'], servings: [['bol', 40]] },
  { subGroups: ['0708'], servings: [['barre', 25]] },
  { subGroups: ['0709'], name: /^crêpe/, servings: [['crêpe', 50]] },
  { subGroups: ['0709'], name: /^gaufre/, servings: [['gaufre', 50]] },
  { subGroups: ['0709'], name: /^madeleine/, servings: [['madeleine', 25]] },
  { subGroups: ['0709'], name: /^macaron/, servings: [['macaron', 12]] },
  { subGroups: ['0709'], name: /^(beignet|donut)/, servings: [['beignet', 70]] },
  { subGroups: ['0709'], name: /^muffin/, servings: [['muffin', 80]] },
  { subGroups: ['0709'], servings: [['part', 80]] },

  // Glaces
  { subGroups: ['0801', '0802', '0000'], name: /glace|sorbet/, servings: [['boule', 50]] },
  { subGroups: ['0801', '0802'], servings: [['boule', 50]] },
  { subGroups: ['0803'], servings: [['portion', 70]] },

  // Matières grasses
  { subGroups: ['0901'], servings: [['noisette', 5], ['c. à soupe', 15]] },
  { subGroups: ['0902'], name: /^(matière grasse|huile ou beurre de|huile ou graisse)/, servings: [['c. à soupe', 13]] },
  { subGroups: ['0902', '0904'], liquid: OIL, servings: [['c. à café', 5], ['c. à soupe', 15]] },
  { subGroups: ['0903'], servings: [['c. à café', 5], ['c. à soupe', 15]] },
  { subGroups: ['0905'], servings: [['c. à soupe', 13]] },

  // Aides culinaires
  { subGroups: ['1001'], name: /^(sauce (tomate|bolognaise|napolitaine|arrabbiata)|coulis de tomate)/, servings: [['c. à soupe', 15], ['portion', 100]] },
  { subGroups: ['1001'], servings: [['c. à soupe', 15]] },
  { subGroups: ['1002'], name: /^cornichon/, servings: [['cornichon', 10]] },
  { subGroups: ['1002'], name: /^olive/, servings: [['olive', 4]] },
  { subGroups: ['1002'], servings: [['c. à café', 5]] },
  { subGroups: ['1003'], name: /^(bouillon|fond de|court-bouillon).*déshydraté/, servings: [['cube', 10]] },
  { subGroups: ['1004'], servings: [['pincée', 0.5], ['c. à café', 6]] },
  { subGroups: ['1005'], servings: [['pincée', 0.3], ['c. à café', 2]] },
  { subGroups: ['1006'], servings: [['c. à soupe', 3]] },
]

/**
 * Unité et portions d'un aliment Ciqual, d'après son sous-groupe et son nom.
 * Faute de règle, l'aliment reste en grammes, sans portion.
 */
export function ciqualPortions(subGroupCode: string, name: string): FoodPortions {
  const lower = name.toLowerCase()
  const rule = RULES.find(
    (candidate) =>
      candidate.subGroups.includes(subGroupCode) &&
      (candidate.name === undefined || candidate.name.test(lower)),
  )
  if (rule === undefined) return { unit: BaseUnit.GRAM, density: 1, servings: [] }

  const density = rule.liquid?.density ?? 1
  const servings: Serving[] = rule.servings.map(([label, amount]) => ({
    label,
    // Une portion de liquide est donnée en millilitres ; la fiche, elle, compte
    // pour 100 g : la densité fait le lien.
    grams: Math.round(amount * density * 10) / 10,
    approximate: true,
  }))
  return {
    unit: rule.liquid === undefined ? BaseUnit.GRAM : BaseUnit.MILLILITRE,
    density,
    servings,
  }
}
