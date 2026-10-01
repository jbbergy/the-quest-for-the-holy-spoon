/** Mes recettes : liste et détail. */
export const recipes = {
  list: {
    title: 'Mes recettes',
    count: '{n} recette. | {n} recettes.',
    meta: '{n} aliment\u00A0: {list} | {n} aliments\u00A0: {list}',
    emptyTitle: 'Vous n’avez pas encore de recette.',
    emptyDescription:
      'Composez un repas, puis choisissez «\u00A0Garder comme recette\u00A0». Vous la retrouverez ici, et dans la recherche d’aliments.',
    compose: 'Composer un repas',
  },
  detail: {
    notFoundTitle: 'Cette recette n’existe plus.',
    notFoundDescription: 'Elle a été supprimée, sur cet appareil ou sur un autre.',
    nameCard: 'Nom',
    nameLabel: 'Nom de la recette',
    rename: 'Changer le nom',
    foodsCard: 'Aliments',
    foodsCount: '{n} aliment | {n} aliments',
    amountOf: 'Quantité de {food}, en {unit}',
    remove: 'Retirer {food}',
    note: 'Pour ajouter un aliment, composez un repas avec la recette, ajoutez-y l’aliment, puis gardez-le comme recette sous un autre nom.',
    deleteQuestion: 'Supprimer la recette «\u00A0{name}\u00A0»\u202F? Les repas déjà composés ne changent pas.',
    delete: 'Supprimer',
    deleteRecipe: 'Supprimer la recette',
    nameSaved: 'Nom enregistré.',
    amountSaved: 'Quantité de {food} enregistrée.',
    lineRemoved: '{food} retiré de la recette.',
  },
} as const
