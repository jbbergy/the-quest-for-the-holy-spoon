import gsap from 'gsap'
import { onScopeDispose, ref, type Ref, watch } from 'vue'

import { useReducedMotion } from './useReducedMotion'

export interface AnimatedNumberOptions {
  readonly duration?: number
  readonly ease?: string
  /** Animer depuis zéro à la première valeur plutôt que de l'afficher d'emblée. */
  readonly animateOnMount?: boolean
}

/**
 * Interpole une valeur numérique à chaque changement de sa source.
 *
 * C'est ici que l'immutabilité du domaine paie. Les entités sont remplacées en
 * bloc, jamais mutées : le `watch` observe donc une **réassignation de
 * référence**, événement discret et sans ambiguïté. Avec des entités mutables,
 * le déclenchement dépendrait de la profondeur d'observation et raterait —
 * ou rejouerait — des animations au gré des mutations internes.
 *
 * L'animation précédente est systématiquement remplacée plutôt que mise en file :
 * trois ajouts rapides doivent glisser vers le total final, pas jouer trois
 * rebonds à la suite.
 */
export function useAnimatedNumber(
  source: Ref<number> | (() => number),
  options: AnimatedNumberOptions = {},
): Readonly<Ref<number>> {
  const { duration = 0.6, ease = 'power3.out', animateOnMount = false } = options

  const read = typeof source === 'function' ? source : (): number => source.value
  const displayed = ref(animateOnMount ? 0 : read())
  const reducedMotion = useReducedMotion()

  let tween: gsap.core.Tween | null = null

  watch(
    read,
    (next) => {
      tween?.kill()

      // Mouvement réduit : on saute à la valeur finale. L'information est la
      // même, seule la transition disparaît.
      if (reducedMotion.value || !Number.isFinite(next)) {
        displayed.value = Number.isFinite(next) ? next : 0
        return
      }

      tween = gsap.to(displayed, { value: next, duration, ease, overwrite: true })
    },
    { immediate: animateOnMount },
  )

  onScopeDispose(() => tween?.kill())

  return displayed
}
