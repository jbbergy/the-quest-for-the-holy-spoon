import { nextTick } from 'vue'

/**
 * Place le focus sur le premier champ en erreur, une fois l'écran à jour.
 *
 * Une erreur de champ n'est pas une alerte : plusieurs alertes partent en même
 * temps quand plusieurs champs sont faux, et un lecteur d'écran n'en lit
 * souvent qu'une. Le champ porte son erreur par `aria-describedby` ; y placer
 * le focus la fait lire, avec le nom du champ.
 */
export async function focusFirstInvalid(root: ParentNode | null = document): Promise<void> {
  await nextTick()
  root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
}
