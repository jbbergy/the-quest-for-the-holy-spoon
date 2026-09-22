import type { AppContainer } from './composition'

/**
 * Accès au conteneur depuis la couche présentation.
 *
 * Volontairement explicite : `useContainer()` échoue plutôt que de fabriquer un
 * conteneur à la volée. Sans cela, un test qui oublierait d'injecter son double
 * ouvrirait silencieusement une vraie base IndexedDB — un échec bien plus
 * difficile à diagnostiquer que celui-ci.
 */
let current: AppContainer | null = null

export function provideContainer(container: AppContainer): void {
  current = container
}

export function useContainer(): AppContainer {
  if (current === null) {
    throw new Error(
      'Aucun conteneur fourni. Appelez provideContainer() au démarrage de l’application.',
    )
  }
  return current
}

export function resetContainer(): void {
  current = null
}
