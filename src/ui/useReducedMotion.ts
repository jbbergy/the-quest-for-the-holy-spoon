import { onScopeDispose, readonly, type Ref, ref } from 'vue'

/**
 * Préférence de mouvement réduit, réactive.
 *
 * Le CSS neutralise déjà ses propres transitions via `@media`, mais GSAP anime
 * en JavaScript et ignore complètement les règles de feuille de style : il lui
 * faut cette valeur explicitement. Sans elle, les jauges continueraient de
 * rebondir chez quelqu'un qui a demandé à l'éviter — ce que WCAG 2.2 considère
 * comme un déclencheur possible de malaise vestibulaire.
 */
const QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): Readonly<Ref<boolean>> {
  const media = globalThis.matchMedia?.(QUERY) ?? null
  const reduced = ref(media?.matches ?? false)

  if (media !== null) {
    const listener = (event: MediaQueryListEvent): void => {
      reduced.value = event.matches
    }
    media.addEventListener('change', listener)
    onScopeDispose(() => media.removeEventListener('change', listener))
  }

  return readonly(reduced)
}

/** Version impérative, pour les endroits sans portée réactive. */
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(QUERY).matches ?? false
}
