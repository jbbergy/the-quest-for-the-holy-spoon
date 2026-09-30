/**
 * Forme d'un jeu de textes : mêmes clés, chaînes partout.
 *
 * Chaque fichier anglais se type `Messages<typeof fr>` : oublier une clé, en
 * ajouter une de trop ou la mal orthographier fait échouer la compilation.
 * Les fichiers français s'écrivent `as const` pour que leurs clés soient
 * connues précisément.
 */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> }
