/**
 * État de connectivité, consulté par les Use Cases avant de choisir leur source
 * de données : catalogue Ciqual local (toujours disponible) ou Open Food Facts
 * (enrichissement en ligne seulement).
 *
 * Interface d'abord : le domaine et l'application ne connaissent que `INetworkStatus`,
 * ce qui rend le mode hors-ligne trivial à simuler en test.
 */
export interface INetworkStatus {
  isOnline(): boolean
  /** S'abonne aux changements. Retourne la fonction de désabonnement. */
  subscribe(listener: (online: boolean) => void): () => void
}

/**
 * Implémentation navigateur.
 *
 * `navigator.onLine` ne prouve pas qu'Internet est joignable — seulement qu'une
 * interface réseau est active. C'est volontairement suffisant ici : la source
 * distante est de toute façon enrobée d'un `Result`, et un faux positif dégrade
 * proprement vers le catalogue local plutôt que de bloquer l'utilisateur.
 */
export class BrowserNetworkStatus implements INetworkStatus {
  isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine
  }

  subscribe(listener: (online: boolean) => void): () => void {
    if (typeof globalThis.addEventListener !== 'function') return () => undefined

    const onOnline = (): void => listener(true)
    const onOffline = (): void => listener(false)

    globalThis.addEventListener('online', onOnline)
    globalThis.addEventListener('offline', onOffline)

    return () => {
      globalThis.removeEventListener('online', onOnline)
      globalThis.removeEventListener('offline', onOffline)
    }
  }
}

/** État fixe, pour les tests et le rendu hors navigateur. */
export class StaticNetworkStatus implements INetworkStatus {
  constructor(private online: boolean) {}

  isOnline(): boolean {
    return this.online
  }

  set(online: boolean): void {
    this.online = online
    for (const listener of this.listeners) listener(online)
  }

  private readonly listeners = new Set<(online: boolean) => void>()

  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
