import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DatabaseProvider } from '@/core/infrastructure/database'
import { guard, toRepositoryError } from '@/core/infrastructure/idb'
import { isErr, isOk } from '@/core/result'

import { createTestDatabase } from './testDatabase'

/** Reproduit une `DOMException` telle que la lève le navigateur. */
const domException = (name: string): DOMException =>
  Object.assign(new Error(name), { name }) as unknown as DOMException

describe('toRepositoryError', () => {
  it('distingue le quota dépassé, pour que l’UI puisse proposer une purge', () => {
    const error = toRepositoryError(domException('QuotaExceededError'), 'écriture')

    expect(error.code).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(error.kind).toBe('repository')
  })

  it.each(['InvalidStateError', 'UnknownError'])(
    'traduit %s en stockage indisponible',
    (name) => {
      // Ces deux erreurs surviennent en navigation privée ou quand le navigateur
      // refuse le stockage : c'est un message utilisateur distinct d'une panne.
      expect(toRepositoryError(domException(name), 'lecture').code).toBe(
        'STORAGE_UNAVAILABLE',
      )
    },
  )

  it('replie toute autre défaillance sur une erreur générique, en gardant le contexte', () => {
    const cause = domException('ConstraintError')

    const error = toRepositoryError(cause, 'enregistrement d’un aliment')

    expect(error.code).toBe('STORAGE_FAILURE')
    expect(error.message).toContain('enregistrement d’un aliment')
    expect(error.cause).toBe(cause)
  })

  it('accepte une cause qui n’est pas une exception du navigateur', () => {
    const error = toRepositoryError('panne opaque', 'lecture')

    expect(error.code).toBe('STORAGE_FAILURE')
    expect(error.kind).toBe('repository')
  })
})

describe('guard', () => {
  it('transporte la valeur en cas de succès', async () => {
    const result = await guard('test', async () => 42)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe(42)
  })

  it('convertit toute exception en Result, sans jamais la laisser remonter', async () => {
    const result = await guard('test', async () => {
      throw domException('QuotaExceededError')
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('STORAGE_QUOTA_EXCEEDED')
  })
})

describe('DatabaseProvider', () => {
  beforeEach(() => {
    createTestDatabase()
  })

  it('n’ouvre la base qu’une fois pour des appels concurrents', async () => {
    const open = vi.fn(
      async () =>
        // Ouverture volontairement lente : c'est pendant ce délai que les appels
        // concurrents doivent se rabattre sur la même promesse.
        new Promise<IDBDatabase>((resolve) =>
          setTimeout(() => resolve({ close: () => undefined } as unknown as IDBDatabase), 5),
        ),
    )
    const provider = new DatabaseProvider(open)

    await Promise.all([provider.get(), provider.get(), provider.get()])

    // Mémoriser la promesse et non son résultat : sinon quatre repositories
    // construits en parallèle ouvriraient quatre connexions.
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('réessaie après un échec d’ouverture au lieu de le mémoriser', async () => {
    const open = vi
      .fn<() => Promise<IDBDatabase>>()
      .mockRejectedValueOnce(new Error('navigation privée'))
      .mockResolvedValue({ close: () => undefined } as unknown as IDBDatabase)
    const provider = new DatabaseProvider(open)

    await expect(provider.get()).rejects.toThrow('navigation privée')
    await expect(provider.get()).resolves.toBeDefined()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('ferme la connexion et en rouvre une ensuite', async () => {
    const close = vi.fn()
    const open = vi.fn(async () => ({ close }) as unknown as IDBDatabase)
    const provider = new DatabaseProvider(open)

    await provider.get()
    await provider.close()

    expect(close).toHaveBeenCalledTimes(1)
    await provider.get()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('fermer sans avoir ouvert ne lève pas', async () => {
    await expect(new DatabaseProvider(vi.fn()).close()).resolves.toBeUndefined()
  })

  it('fermer après un échec d’ouverture ne relance pas l’erreur', async () => {
    const open = vi.fn<() => Promise<IDBDatabase>>().mockRejectedValue(new Error('échec'))
    const provider = new DatabaseProvider(open)

    await provider.get().catch(() => undefined)

    await expect(provider.close()).resolves.toBeUndefined()
  })
})
