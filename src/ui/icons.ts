/**
 * Icônes au trait de la direction « Marché », dessinées sur une grille de 24.
 *
 * Elles remplacent les caractères Unicode (◎ ▦ ⌂ ⚙ ✓ ○) dont le rendu variait
 * d'une police et d'un système à l'autre. Chaque icône garde l'épaisseur de
 * trait du design : plus fine pour les pictogrammes de navigation, plus
 * épaisse pour les coches et les signes, qui doivent se lire en petit.
 *
 * Les formes sont des **données** (élément et attributs), rendues par
 * `AppIcon` : aucun balisage injecté tel quel dans la page.
 */
export interface IconElement {
  readonly tag: 'path' | 'circle' | 'rect'
  readonly attrs: Readonly<Record<string, string>>
}

export interface IconShape {
  readonly elements: readonly IconElement[]
  readonly strokeWidth: number
}

const path = (d: string): IconElement => ({ tag: 'path', attrs: { d } })
const circle = (cx: number, cy: number, r: number): IconElement => ({
  tag: 'circle',
  attrs: { cx: String(cx), cy: String(cy), r: String(r) },
})
const rect = (x: number, y: number, width: number, height: number, rx: number): IconElement => ({
  tag: 'rect',
  attrs: { x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx) },
})

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'

export const ICONS = {
  today: {
    elements: [
      circle(12, 12, 4),
      path('M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4'),
    ],
    strokeWidth: 1.8,
  },
  week: {
    elements: [rect(3.5, 5, 17, 15.5, 2.5), path('M3.5 10h17M8 3v4M16 3v4')],
    strokeWidth: 1.8,
  },
  pantry: {
    elements: [
      path('M7.5 3.5h9M8.5 3.5v3C6.5 7.5 5.5 9 5.5 11.5v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7c0-2.5-1-4-3-5v-3'),
      path('M5.5 13h13'),
    ],
    strokeWidth: 1.8,
  },
  household: {
    elements: [path('M3.5 11L12 4l8.5 7'), path('M5.5 9.5v11h13v-11'), path('M10 20.5v-5h4v5')],
    strokeWidth: 1.8,
  },
  basket: {
    elements: [path('M3.5 9.5h17l-2 10.5h-13z'), path('M8 9.5l4-6 4 6M9.5 13.5v3M14.5 13.5v3')],
    strokeWidth: 1.8,
  },
  leaf: {
    elements: [path('M5 19c0-8 5-13 14-14-1 9-6 14-14 14z'), path('M5 19l7-7')],
    strokeWidth: 1.8,
  },
  lock: {
    elements: [rect(5, 10.5, 14, 10, 2), path('M8 10.5V8a4 4 0 0 1 8 0v2.5')],
    strokeWidth: 1.8,
  },
  trash: { elements: [path('M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13')], strokeWidth: 1.8 },
  star: { elements: [path(STAR)], strokeWidth: 1.8 },
  /** L'étoile pleine : une quantité déjà gardée en favori. La forme seule le dit, pas la couleur. */
  'star-filled': { elements: [{ tag: 'path', attrs: { d: STAR, fill: 'currentColor' } }], strokeWidth: 1.8 },
  swap: { elements: [path('M4.5 8h14l-3.5-3.5'), path('M19.5 16h-14l3.5 3.5')], strokeWidth: 1.8 },
  copy: {
    elements: [rect(8.5, 8.5, 12, 12, 2), path('M15.5 5.5v-1a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4.5V14A1.5 1.5 0 0 0 5 15.5h1')],
    strokeWidth: 1.8,
  },
  /**
   * La marque : une cuillère penchée, en silhouette pleine. Au trait, le
   * cuilleron et le manche ressemblaient à une loupe — celle de la recherche.
   */
  spoon: {
    elements: [
      {
        tag: 'path',
        attrs: {
          d: 'M12 1.8c2.5 0 4 2.5 4 5.1 0 2.2-1.2 3.9-3 4.5l-.5 9.8h-1L11 11.4c-1.8-.6-3-2.3-3-4.5 0-2.6 1.5-5.1 4-5.1z',
          fill: 'currentColor',
          transform: 'rotate(35 12 12)',
        },
      },
    ],
    strokeWidth: 1,
  },
  offline: {
    elements: [
      path('M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0'),
      path('M3 3l18 18'),
    ],
    strokeWidth: 1.8,
  },
  check: { elements: [path('M5 12.5l4.5 4.5L19 7.5')], strokeWidth: 2.4 },
  plus: { elements: [path('M12 5v14M5 12h14')], strokeWidth: 2.2 },
  minus: { elements: [path('M5 12h14')], strokeWidth: 2.2 },
  close: { elements: [path('M6 6l12 12M18 6L6 18')], strokeWidth: 2 },
  retry: { elements: [path('M4.5 12a7.5 7.5 0 0 1 13.2-4.9L20 9.5'), path('M20 4.5v5h-5'), path('M19.5 12a7.5 7.5 0 0 1-13.2 4.9L4 14.5'), path('M4 19.5v-5h5')], strokeWidth: 2 },
  /** Un code-barres dans le viseur : scanner avec la caméra. */
  barcode: {
    elements: [
      path('M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16'),
      path('M7.5 8v8M10.5 8v8M13.5 8v8M16.5 8v8'),
    ],
    strokeWidth: 1.8,
  },
  search: { elements: [circle(11, 11, 6.5), path('M20 20l-4.2-4.2')], strokeWidth: 2 },
  alert: { elements: [circle(12, 12, 9), path('M12 7.5v5.5M12 16.5v.01')], strokeWidth: 2 },
  'chevron-left': { elements: [path('M15 6l-6 6 6 6')], strokeWidth: 2 },
  'chevron-right': { elements: [path('M9 6l6 6-6 6')], strokeWidth: 2 },
  'chevron-up': { elements: [path('M6 15l6-6 6 6')], strokeWidth: 2 },
  'chevron-down': { elements: [path('M6 9l6 6 6-6')], strokeWidth: 2 },
  /** Arc de chargement : tourne dans `BaseButton`, immobile si le mouvement est réduit. */
  spinner: { elements: [path('M12 3a9 9 0 1 0 9 9')], strokeWidth: 2.4 },
} as const satisfies Record<string, IconShape>

export type IconName = keyof typeof ICONS
