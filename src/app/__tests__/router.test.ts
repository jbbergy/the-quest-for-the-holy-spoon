// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { createAppRouter, ROUTE } from '@/app/router'

describe('Adresses', () => {
  it('une adresse inconnue mène à « Page introuvable », pas à l’accueil sans un mot', () => {
    const router = createAppRouter()

    expect(router.resolve('/nimporte/quoi').name).toBe(ROUTE.notFound)
    expect(router.resolve('/semaine').name).toBe(ROUTE.weekPlan)
  })
})
