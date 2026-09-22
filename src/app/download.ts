import { ApplicationError } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'

/**
 * Le navigateur ne libère pas toujours l'URL d'objet avant d'avoir commencé le
 * téléchargement : la révoquer dans la foulée du clic annule le transfert sur
 * certaines versions de Safari. Un tour de boucle d'événements suffit à l'éviter.
 */
const REVOKE_DELAY_MS = 0

/**
 * Propose un objet au téléchargement sous forme de fichier JSON.
 *
 * Seul endroit de l'application qui fabrique un lien de téléchargement. Le
 * `try/catch` n'est pas décoratif : `createObjectURL` échoue en navigation
 * privée restreinte et dans certains navigateurs embarqués, et l'utilisateur
 * doit alors voir un message plutôt qu'un bouton qui ne fait rien.
 */
export function downloadJson(fileName: string, payload: unknown): Result<void, ApplicationError> {
  try {
    // Indenté : l'archive est destinée à être ouverte et relue par un humain.
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
    return ok(undefined)
  } catch (cause) {
    return err(
      new ApplicationError('DOWNLOAD_FAILED', 'Le fichier n’a pas pu être produit.', { cause }),
    )
  }
}
