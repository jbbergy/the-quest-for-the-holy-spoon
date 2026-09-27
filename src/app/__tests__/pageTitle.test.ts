// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, type Plugin, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { pageTitle, setPageTitle, usePageTitle } from '@/app/pageTitle'
import { useBackLink, useReturnQuery } from '@/app/useBackLink'

/** Monte un composant vide qui appelle `setup` : un composable n'existe que dans un composant. */
function withSetup(setup: () => void, plugins: Plugin[] = []): void {
  mount(defineComponent({ setup: () => (setup(), () => h('div')) }), { global: { plugins } })
}

describe('titre de la page', () => {
  it('suffixe le nom de l’application, seul quand l’écran n’a pas de titre', () => {
    setPageTitle('Semaine')
    expect(document.title).toBe('Semaine · Holy Spoon')
    expect(pageTitle.value).toBe('Semaine')

    setPageTitle('')
    expect(document.title).toBe('Holy Spoon')
  })

  it('suit le titre propre à un écran tant qu’il change', async () => {
    const name = ref('Déjeuner')
    withSetup(() => usePageTitle(() => `${name.value} du lundi`))

    expect(document.title).toBe('Déjeuner du lundi · Holy Spoon')
    name.value = 'Dîner'
    await nextTick()
    expect(document.title).toBe('Dîner du lundi · Holy Spoon')
  })
})

describe('lien de retour', () => {
  const blank = { render: () => h('div') }

  async function backFrom(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/tableau-de-bord', name: 'dashboard', meta: { title: 'Accueil' }, component: blank },
        { path: '/semaine', name: 'week', meta: { title: 'Semaine' }, component: blank },
        { path: '/semaine/repas/:id', name: 'meal', component: blank },
      ],
    })
    await router.push(path)
    let back: ReturnType<typeof useBackLink> | null = null
    let query: ReturnType<typeof useReturnQuery> | null = null
    withSetup(() => {
      back = useBackLink({ to: { name: 'week' }, label: 'Semaine' })
      query = useReturnQuery()
    }, [router])
    return { back: back!.value, query: query!.value }
  }

  it('ramène à l’écran d’où l’on vient, nommé par son titre', async () => {
    const { back } = await backFrom('/semaine/repas/1?retour=%2Ftableau-de-bord')
    expect(back).toEqual({ to: '/tableau-de-bord', label: 'Accueil' })
  })

  it('se rabat sur l’écran par défaut sans provenance, ou avec une adresse externe', async () => {
    expect((await backFrom('/semaine/repas/1')).back.label).toBe('Semaine')
    const external = await backFrom('/semaine/repas/1?retour=%2F%2Fexemple.org')
    expect(external.back).toEqual({ to: { name: 'week' }, label: 'Semaine' })
  })

  it('garde le nom par défaut pour un chemin interne inconnu', async () => {
    const { back } = await backFrom('/semaine/repas/1?retour=%2Fnulle-part')
    expect(back.label).toBe('Semaine')
  })

  it('passe l’écran courant en provenance aux liens qui en partent', async () => {
    const { query } = await backFrom('/semaine/repas/1?x=1')
    expect(query).toEqual({ retour: '/semaine/repas/1?x=1' })
  })
})
