// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import ServiceWorkerNotice from '@/app/components/ServiceWorkerNotice.vue'
import {
  createServiceWorkerState,
  provideServiceWorkerState,
  resetServiceWorkerState,
  type ServiceWorkerHooks,
  useServiceWorkerState,
} from '@/app/pwa/serviceWorker'

/**
 * Registrar de test : il **capture** les rappels au lieu d'enregistrer quoi que
 * ce soit, ce qui permet de déclencher « mise à jour disponible » et « prête
 * hors connexion » à la demande, sans service worker ni navigateur.
 */
function fakeRegistrar(): {
  hooks: ServiceWorkerHooks
  activate: ReturnType<typeof vi.fn>
  register: (hooks: ServiceWorkerHooks) => (reload?: boolean) => Promise<void>
} {
  let captured: ServiceWorkerHooks | null = null
  const activate = vi.fn(async () => undefined)

  return {
    get hooks() {
      if (captured === null) throw new Error('le registrar n’a pas été appelé')
      return captured
    },
    activate,
    register: (hooks) => {
      captured = hooks
      return activate
    },
  }
}

afterEach(() => {
  resetServiceWorkerState()
  vi.restoreAllMocks()
})

describe('createServiceWorkerState', () => {
  it('s’enregistre immédiatement, sans rien annoncer', () => {
    const sw = fakeRegistrar()

    const state = createServiceWorkerState(sw.register)

    expect(sw.hooks).toBeDefined()
    expect(state.needRefresh.value).toBe(false)
    expect(state.offlineReady.value).toBe(false)
  })

  it('signale une mise à jour disponible', () => {
    const sw = fakeRegistrar()
    const state = createServiceWorkerState(sw.register)

    sw.hooks.onNeedRefresh()

    expect(state.needRefresh.value).toBe(true)
  })

  it('signale la disponibilité hors connexion', () => {
    const sw = fakeRegistrar()
    const state = createServiceWorkerState(sw.register)

    sw.hooks.onOfflineReady()

    expect(state.offlineReady.value).toBe(true)
  })

  it('active la nouvelle version en demandant le rechargement', async () => {
    const sw = fakeRegistrar()
    const state = createServiceWorkerState(sw.register)
    sw.hooks.onNeedRefresh()

    await state.applyUpdate()

    expect(sw.activate).toHaveBeenCalledWith(true)
  })

  it('laisse l’annonce visible si l’activation échoue', async () => {
    const sw = fakeRegistrar()
    sw.activate.mockRejectedValueOnce(new Error('activation impossible'))
    const state = createServiceWorkerState(sw.register)
    sw.hooks.onNeedRefresh()

    await expect(state.applyUpdate()).rejects.toThrow('activation impossible')

    // La page ne s'est pas rechargée : retirer la proposition laisserait croire
    // la mise à jour faite.
    expect(state.needRefresh.value).toBe(true)
    expect(state.applying.value).toBe(false)
  })

  it('ignore un second appel tant que l’activation est en cours', async () => {
    const sw = fakeRegistrar()
    let release = (): void => undefined
    sw.activate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const state = createServiceWorkerState(sw.register)

    const first = state.applyUpdate()
    expect(state.applying.value).toBe(true)
    await state.applyUpdate()

    expect(sw.activate).toHaveBeenCalledTimes(1)
    release()
    await first
    expect(state.applying.value).toBe(false)
  })

  it('permet de reporter la mise à jour et de fermer l’annonce hors connexion', () => {
    const sw = fakeRegistrar()
    const state = createServiceWorkerState(sw.register)
    sw.hooks.onNeedRefresh()
    sw.hooks.onOfflineReady()

    state.dismissUpdate()
    state.dismissOfflineNotice()

    expect(state.needRefresh.value).toBe(false)
    expect(state.offlineReady.value).toBe(false)
  })
})

describe('useServiceWorkerState', () => {
  it('rend un état inerte tant qu’aucun service worker n’est enregistré', async () => {
    const state = useServiceWorkerState()

    expect(state.needRefresh.value).toBe(false)
    // Rien ne doit lever : en développement et dans les tests, l'absence de
    // service worker est la situation normale, pas un bug.
    await expect(state.applyUpdate()).resolves.toBeUndefined()
    state.dismissUpdate()
    state.dismissOfflineNotice()
  })

  it('rend l’état fourni une fois celui-ci installé', () => {
    const sw = fakeRegistrar()
    const state = createServiceWorkerState(sw.register)
    provideServiceWorkerState(state)

    expect(useServiceWorkerState()).toBe(state)
  })
})

describe('ServiceWorkerNotice', () => {
  let sw: ReturnType<typeof fakeRegistrar>

  beforeEach(() => {
    sw = fakeRegistrar()
    provideServiceWorkerState(createServiceWorkerState(sw.register))
  })

  it('reste muet quand il n’y a rien à annoncer', () => {
    const wrapper = mount(ServiceWorkerNotice)

    expect(wrapper.text()).toBe('')
    // La région vide doit exister dès le départ : une région `aria-live`
    // ajoutée en même temps que son contenu n'est pas annoncée.
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
  })

  it('propose la mise à jour sans l’imposer', async () => {
    const wrapper = mount(ServiceWorkerNotice)

    sw.hooks.onNeedRefresh()
    await nextTick()

    const buttons = wrapper.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['Mettre à jour', 'Plus tard'])
    expect(sw.activate).not.toHaveBeenCalled()
  })

  it('active la nouvelle version au clic', async () => {
    const wrapper = mount(ServiceWorkerNotice)
    sw.hooks.onNeedRefresh()
    await nextTick()

    await wrapper.findAll('button')[0]!.trigger('click')

    expect(sw.activate).toHaveBeenCalledWith(true)
  })

  it('retire l’annonce quand on la reporte', async () => {
    const wrapper = mount(ServiceWorkerNotice)
    sw.hooks.onNeedRefresh()
    await nextTick()

    await wrapper.findAll('button')[1]!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toBe('')
  })

  it('fait passer la mise à jour devant l’annonce hors connexion', async () => {
    const wrapper = mount(ServiceWorkerNotice)

    sw.hooks.onOfflineReady()
    sw.hooks.onNeedRefresh()
    await nextTick()

    // Deux bandes empilées ne tiendraient pas au-dessus de la barre de
    // navigation sur un écran étroit ; celle qui appelle une décision passe.
    expect(wrapper.text()).toContain('Une nouvelle version est prête.')
    expect(wrapper.text()).not.toContain('sans connexion')
  })

  it('annonce la disponibilité hors connexion, et sait se taire', async () => {
    const wrapper = mount(ServiceWorkerNotice)

    sw.hooks.onOfflineReady()
    await nextTick()
    expect(wrapper.text()).toContain('Prête à fonctionner sans connexion.')

    await wrapper.find('button').trigger('click')
    await nextTick()
    expect(wrapper.text()).toBe('')
  })
})
