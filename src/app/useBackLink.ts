import { computed, type ComputedRef } from 'vue'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'

import { returnPath } from '@/app/router'

export interface BackLink {
  readonly to: RouteLocationRaw
  /** Le nom de l'écran où l'on retourne : « Accueil », « Semaine »… */
  readonly label: string
}

/**
 * Le chemin du retour : l'écran d'où l'on vient, passé en `?retour=`, ou
 * `fallback` quand on est arrivé autrement (lien direct, rechargement).
 *
 * Un repas s'ouvre depuis l'accueil comme depuis la semaine : un retour figé
 * vers la semaine emmenait ailleurs que là d'où l'on venait. Seul un chemin
 * interne est suivi, comme pour `?suite=` à la connexion.
 */
export function useBackLink(fallback: BackLink): ComputedRef<BackLink> {
  const route = useRoute()
  const router = useRouter()

  return computed(() => {
    const path = returnPath(route.query.retour)
    if (path === null) return fallback
    const target = router.resolve(path)
    const title = target.meta.title
    return {
      to: target.fullPath,
      label: typeof title === 'string' && target.matched.length > 0 ? title : fallback.label,
    }
  })
}

/** `?retour=` pour un lien qui doit ramener à l'écran courant. */
export function useReturnQuery(): ComputedRef<{ readonly retour: string }> {
  const route = useRoute()
  return computed(() => ({ retour: route.fullPath }))
}
