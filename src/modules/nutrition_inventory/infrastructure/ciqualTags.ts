import { FoodTag } from '../domain/FoodItem'

/**
 * Marqueurs d'une fiche Ciqual, déduits de son **sous-groupe** et de son
 * **nom**.
 *
 * Ciqual ne dit ni ce qui contient du gluten, ni ce qui contient du lait. Le
 * sous-groupe en dit beaucoup — « fromages », « pains », « œufs » — et le nom
 * complète pour les plats composés, où « Hachis parmentier » et « Gratin de
 * légumes » se côtoient.
 *
 * Le groupe de premier niveau est inutilisable : « viandes, œufs, poissons et
 * assimilés » réunit 788 aliments, et marquer tout ce lot `CONTAINS_MEAT`
 * classerait les œufs et le saumon comme de la viande.
 *
 * Ces marqueurs servent à **exclure** un aliment d'un régime, jamais à
 * affirmer qu'il convient. Les tables restent donc prudentes : ne rien
 * marquer laisse l'aliment visible ; le marquer à tort le ferait disparaître à
 * tort.
 */
const SUBGROUP_TAGS: Readonly<Record<string, readonly FoodTag[]>> = {
  '0104': [FoodTag.CONTAINS_GLUTEN], // pizzas, tartes et crêpes salées
  '0105': [FoodTag.CONTAINS_GLUTEN], // sandwichs
  '0106': [FoodTag.CONTAINS_GLUTEN], // feuilletées et autres entrées
  '0205': [FoodTag.CONTAINS_NUTS], // fruits à coque et graines oléagineuses
  '0302': [FoodTag.CONTAINS_GLUTEN], // pains et assimilés
  '0303': [FoodTag.CONTAINS_GLUTEN], // biscuits apéritifs
  '0401': [FoodTag.CONTAINS_MEAT], // viandes cuites
  '0402': [FoodTag.CONTAINS_MEAT], // viandes crues
  // Le porc par défaut : l'essentiel du rayon. Les exceptions (volaille,
  // canard, bœuf…) se lisent dans le nom.
  '0403': [FoodTag.CONTAINS_MEAT, FoodTag.CONTAINS_PORK], // charcuteries et assimilés
  '0404': [FoodTag.CONTAINS_MEAT], // autres produits à base de viande
  '0405': [FoodTag.CONTAINS_FISH], // poissons cuits
  '0406': [FoodTag.CONTAINS_FISH], // poissons crus
  '0407': [FoodTag.CONTAINS_SHELLFISH], // mollusques et crustacés cuits
  '0408': [FoodTag.CONTAINS_SHELLFISH], // mollusques et crustacés crus
  '0409': [FoodTag.CONTAINS_FISH], // produits à base de poissons et de la mer
  '0410': [FoodTag.CONTAINS_EGG], // œufs
  '0501': [FoodTag.CONTAINS_MILK], // laits
  '0603': [FoodTag.CONTAINS_ALCOHOL], // boissons alcoolisées
  '0502': [FoodTag.CONTAINS_MILK], // produits laitiers frais
  '0503': [FoodTag.CONTAINS_MILK], // fromages
  '0504': [FoodTag.CONTAINS_MILK], // crèmes
  '0705': [FoodTag.CONTAINS_GLUTEN], // viennoiseries
  '0706': [FoodTag.CONTAINS_GLUTEN], // biscuits sucrés
  '0709': [FoodTag.CONTAINS_GLUTEN], // gâteaux et pâtisseries
  '0801': [FoodTag.CONTAINS_MILK], // glaces
  '0901': [FoodTag.CONTAINS_MILK], // beurres
  '0904': [FoodTag.CONTAINS_FISH], // huiles de poissons
  '1104': [FoodTag.CONTAINS_GLUTEN], // céréales et biscuits infantiles
}

/**
 * Mots qui, dans un nom, trahissent un ingrédient. Comparés sans accents ni
 * majuscules, et en mots entiers : « thon » ne doit pas marquer « Marathon ».
 */
const NAME_WORDS: ReadonlyArray<readonly [FoodTag, readonly string[]]> = [
  [
    FoodTag.CONTAINS_MEAT,
    [
      'agneau', 'bacon', 'boeuf', 'bolognaise', 'canard', 'cassoulet', 'cheval', 'chipolata',
      'chorizo', 'cordon bleu', 'dinde', 'foie gras', 'gibier', 'hachis', 'jambon',
      'kebab', 'lapin', 'lardon', 'lardons', 'merguez', 'mouton', 'nuggets', 'pate de campagne',
      'porc', 'poulet', 'rillettes', 'saucisse', 'saucisses', 'saucisson', 'veau', 'viande',
      'viandes', 'volaille',
    ],
  ],
  [
    FoodTag.CONTAINS_FISH,
    [
      'anchois', 'brandade', 'cabillaud', 'colin', 'hareng', 'maquereau', 'merlu', 'morue',
      'poisson', 'poissons', 'saumon', 'sardine', 'sardines', 'surimi', 'tarama', 'thon',
      'truite',
    ],
  ],
  [
    FoodTag.CONTAINS_SHELLFISH,
    [
      'araignee de mer', 'bigorneau', 'bigorneaux', 'bisque', 'bulot', 'bulots', 'calamar',
      'calamars', 'calmar', 'calmars', 'clam', 'crabe', 'crevette',
      'crevettes', 'ecrevisse', 'ecrevisses', 'encornet', 'encornets', 'escargot', 'escargots',
      'fruits de mer', 'gambas', 'homard', 'huitre', 'huitres', 'langouste', 'langoustine',
      'langoustines', 'moule', 'moules', 'ormeau', 'oursin', 'palourde', 'palourdes', 'paella',
      'petoncle', 'poulpe', 'praire', 'saint-jacques', 'seiche', 'tourteau',
    ],
  ],
  [
    FoodTag.CONTAINS_PORK,
    [
      'andouille', 'andouillette', 'bacon', 'boudin', 'carbonara', 'cassoulet', 'cervelas',
      'chipolata', 'chorizo', 'choucroute garnie', 'cochon', 'coppa', 'croque-monsieur', 'jambon',
      'jambonneau', 'lard', 'lardon', 'lardons', 'mortadelle', 'pancetta', 'petit sale', 'porc',
      'potee', 'quiche lorraine', 'rillettes', 'rosette', 'salami', 'sanglier', 'saucisson',
      'tartiflette',
    ],
  ],
  [
    FoodTag.CONTAINS_BEEF,
    [
      'bavette', 'blanquette', 'boeuf', 'bolognaise', 'bourguignon', 'bresaola', 'cheeseburger',
      'chili con carne', 'corned-beef', 'entrecote', 'faux-filet', 'grisons', 'hachis parmentier',
      'hamburger', 'merguez', 'pot-au-feu', 'rosbif', 'rumsteck', 'steak', 'tartare', 'tournedos',
      'tripes', 'veau',
    ],
  ],
  [
    FoodTag.CONTAINS_ALCOHOL,
    [
      'armagnac', 'biere', 'bieres', 'bourguignon', 'bourguignonne', 'calvados', 'champagne',
      'cidre', 'cognac', 'eau de vie', 'gin', 'kir', 'liqueur', 'mariniere', 'marinieres',
      'marsala', 'pastis', 'porto', 'punch', 'rhum', 'sake', 'sangria', 'vermouth', 'vin', 'vins',
      'vodka', 'whisky',
    ],
  ],
  [
    FoodTag.CONTAINS_GLUTEN,
    [
      'ble', 'biere', 'boulgour', 'chapelure', 'couscous', 'crepe', 'crepes', 'epeautre',
      'farine', 'gnocchi', 'lasagne', 'lasagnes', 'macaroni', 'pain', 'pane', 'panee', 'pate',
      'pates', 'orge', 'ravioli', 'raviolis', 'seigle', 'semoule', 'spaghetti', 'tagliatelle',
      'tagliatelles',
    ],
  ],
  [
    FoodTag.CONTAINS_MILK,
    [
      'bechamel', 'beurre', 'comte', 'creme', 'emmental', 'fromage', 'gratin', 'lait',
      'mozzarella', 'parmesan', 'yaourt',
    ],
  ],
  [FoodTag.CONTAINS_EGG, ['mayonnaise', 'oeuf', 'oeufs', 'omelette']],
]

/**
 * Mots qui **annulent** un marqueur, qu'il vienne du nom ou du sous-groupe. « Lait de coco » n'est pas
 * du lait, « pâte de fruits » n'est pas une pâte, « pain de mie sans gluten »
 * reste sans gluten.
 */
const NAME_EXCEPTIONS: Readonly<Partial<Record<FoodTag, readonly string[]>>> = {
  [FoodTag.CONTAINS_MEAT]: ['vegetarien', 'vegetarienne', 'vegetal', 'vegetale', 'sans viande'],
  // Une charcuterie d'un autre animal : « Jambon de dinde », « Rillettes de
  // canard ». Le porc revient s'il est nommé (`NAME_CONFIRMATIONS`).
  [FoodTag.CONTAINS_PORK]: [
    'agneau', 'boeuf', 'bresaola', 'canard', 'cheval', 'corned-beef', 'crabe', 'dinde', 'grisons',
    'maquereau', 'merguez', 'mouton', 'oie', 'poisson', 'poulet', 'sardine', 'sardines', 'saumon',
    'seitan', 'thon', 'tofu', 'truite', 'veau', 'vegetal', 'vegetale', 'vegetarien',
    'vegetarienne', 'volaille',
  ],
  [FoodTag.CONTAINS_BEEF]: [
    'agneau', 'canard', 'cheval', 'dinde', 'poisson', 'poulet', 'saumon', 'seitan', 'soja', 'thon',
    'tofu', 'vegetal', 'vegetale', 'vegetarien', 'vegetarienne', 'volaille',
  ],
  // Les cuisses de grenouille sont rangées avec les crustacés.
  [FoodTag.CONTAINS_SHELLFISH]: ['grenouille'],
  [FoodTag.CONTAINS_ALCOHOL]: ['sans alcool', 'desalcoolise', 'desalcoolisee'],
  [FoodTag.CONTAINS_GLUTEN]: [
    'sans gluten', 'pate de fruits', 'pate a tartiner', 'pate d\'amande', 'sarrasin', 'ble noir',
    'galette de riz', 'galettes de riz', 'farine de riz', 'farine de mais', 'semoule de mais',
  ],
  [FoodTag.CONTAINS_MILK]: [
    'lait de coco', 'lait d\'amande', 'lait de soja', 'lait de riz', 'lait d\'avoine',
    'boisson vegetale', 'vegetal', 'vegetale', 'soja', 'coco', 'beurre de cacahuete',
    'beurre de cacao', 'haricot beurre', 'haricots beurre', 'creme de marron', 'creme de marrons', 'sans lactose', 'delactose',
  ],
}

/**
 * Mots qui **rétablissent** un marqueur écarté par une exception : « Merguez,
 * bœuf, mouton et porc » contient du porc, malgré le bœuf et le mouton.
 */
const NAME_CONFIRMATIONS: ReadonlyArray<readonly [FoodTag, readonly string[]]> = [
  [FoodTag.CONTAINS_PORK, ['porc', 'cochon', 'sanglier']],
  [FoodTag.CONTAINS_BEEF, ['boeuf', 'veau']],
]

/**
 * Expressions effacées du nom avant toute lecture : elles contiennent un mot
 * trompeur. Une tomate cœur de bœuf n'est pas du bœuf, le vinaigre de vin ne
 * contient plus d'alcool, la viande « à bourguignon » est crue, la sauce
 * tartare est une mayonnaise.
 */
const NEUTRAL_PHRASES: readonly string[] = [
  'a bourguignon', 'citron punch', 'coeur de boeuf', 'pain pour hamburger', 'sauce tartare',
  'vinaigre de cidre', 'vinaigre de vin',
]

/** Les « sans lactose » ou « sans gluten » écrits dans le nom admettent l'aliment. */
const NAME_ADMISSIONS: ReadonlyArray<readonly [FoodTag, readonly string[]]> = [
  [FoodTag.GLUTEN_FREE, ['sans gluten']],
  [FoodTag.LACTOSE_FREE, ['sans lactose', 'delactose']],
]

export function ciqualTags(subGroupCode: string, name: string): FoodTag[] {
  return tagsFrom(SUBGROUP_TAGS[subGroupCode] ?? [], name)
}

/**
 * Les seuls marqueurs `among` que le nom d'un produit trahit.
 *
 * Pour Open Food Facts, dont les allergènes disent le gluten ou le lait mais
 * jamais le porc, le bœuf ni l'alcool.
 */
export function nameTags(name: string, among: readonly FoodTag[]): FoodTag[] {
  return tagsFrom([], name).filter((tag) => among.includes(tag))
}

function tagsFrom(initial: readonly FoodTag[], name: string): FoodTag[] {
  let words = normalize(name)
  for (const phrase of NEUTRAL_PHRASES) {
    words = words.replace(new RegExp(`(?<=[ '-])${escape(phrase)}(?=[ '-])`, 'g'), ' ')
  }
  const tags = new Set<FoodTag>(initial)

  for (const [tag, candidates] of NAME_WORDS) {
    if (candidates.some((candidate) => contains(words, candidate))) tags.add(tag)
  }
  // Après le sous-groupe comme après les mots : une galette de sarrasin est
  // rangée avec les crêpes, mais ne contient pas de gluten.
  for (const [tag, exceptions] of Object.entries(NAME_EXCEPTIONS) as [FoodTag, string[]][]) {
    if (exceptions.some((exception) => contains(words, exception))) tags.delete(tag)
  }
  for (const [tag, candidates] of NAME_CONFIRMATIONS) {
    if (candidates.some((candidate) => contains(words, candidate))) tags.add(tag)
  }
  for (const [tag, candidates] of NAME_ADMISSIONS) {
    if (candidates.some((candidate) => contains(words, candidate))) tags.add(tag)
  }
  return [...tags]
}

/** Minuscules, sans accents, « œ » défait, ponctuation réduite à des espaces. */
function normalize(text: string): string {
  const plain = text
    .toLocaleLowerCase('fr-FR')
    .replaceAll('œ', 'oe')
    .replaceAll('’', '\'')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9' -]+/g, ' ')
  return ` ${plain.replace(/\s+/g, ' ').trim()} `
}

/** Le mot ou l'expression, entier : bordé d'espaces, d'apostrophes ou de tirets. */
function contains(words: string, candidate: string): boolean {
  return new RegExp(`[ '-]${escape(candidate)}[ '-]`).test(words)
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
