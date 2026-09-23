import { describe, expect, it, vi } from 'vitest'

import { StaticNetworkStatus } from '@/core/infrastructure/NetworkStatusService'
import { isErr, isOk } from '@/core/result'
import { FoodSource, FoodTag } from '@/modules/nutrition_inventory/domain/FoodItem'
import { OpenFoodFactsProvider } from '@/modules/nutrition_inventory/infrastructure/OpenFoodFactsProvider'

import bioFixture from './fixtures/off-bio.json'
import notFoundFixture from './fixtures/off-not-found.json'
import nutellaFixture from './fixtures/off-nutella.json'
import searchFixture from './fixtures/off-search.json'

/** Réponse `fetch` minimale — seul ce que le provider consomme est simulé. */
const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

const providerWith = (
  fetchImpl: typeof fetch,
  online = true,
): OpenFoodFactsProvider =>
  new OpenFoodFactsProvider(new StaticNetworkStatus(online), {
    fetchImpl,
    searchRetryDelayMs: 0,
  })

const fetchReturning = (body: unknown, status = 200): typeof fetch =>
  vi.fn(async () => jsonResponse(body, status)) as unknown as typeof fetch

describe('OpenFoodFactsProvider', () => {
  describe('payloads réels', () => {
    it('convertit un produit complet en FoodItem', async () => {
      const provider = providerWith(fetchReturning(nutellaFixture))

      const result = await provider.findByBarcode('3017620422003')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.name).toBe('Nutella')
        expect(result.value.source).toBe(FoodSource.OPEN_FOOD_FACTS)
        expect(result.value.barcode).toBe('3017620422003')
        expect(result.value.macrosPer100g.proteinG).toBe(6.3)
        expect(result.value.macrosPer100g.carbsG).toBe(57.5)
        expect(result.value.macrosPer100g.fatG).toBe(30.9)
      }
    })

    it('traduit les étiquettes et allergènes vers le vocabulaire du domaine', async () => {
      const provider = providerWith(fetchReturning(nutellaFixture))

      const result = await provider.findByBarcode('3017620422003')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.hasTag(FoodTag.VEGETARIAN)).toBe(true)
        expect(result.value.hasTag(FoodTag.GLUTEN_FREE)).toBe(true)
        expect(result.value.hasTag(FoodTag.CONTAINS_NUTS)).toBe(true)
        // `fr:triman` est un pictogramme de tri, sans signification diététique.
        expect(result.value.tags).not.toContain('TRIMAN')
      }
    })

    it('ignore les étiquettes non reconnues d’un produit bio', async () => {
      const provider = providerWith(fetchReturning(bioFixture))

      const result = await provider.findByBarcode('3229820129488')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        // Le produit porte 16 étiquettes OFF, dont aucune n'appartient au
        // vocabulaire du domaine : la traduction doit n'en retenir aucune plutôt
        // que d'inventer des marqueurs.
        expect(result.value.tags.every((tag) => tag in FoodTag)).toBe(true)
      }
    })

    it('traite un code inconnu comme un résultat nul, pas comme une erreur', async () => {
      // L'API renvoie un HTTP 404 avec un corps exploitable : le traiter comme
      // une panne priverait l'utilisateur de l'information « produit absent ».
      const provider = providerWith(fetchReturning(notFoundFixture, 404))

      const result = await provider.findByBarcode('9999999999993')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBeNull()
    })
  })

  describe('payloads dégradés', () => {
    it('accepte des valeurs nutritionnelles en chaîne', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            code: '1234567890123',
            product_name: 'Produit contribué',
            nutriments: { proteins_100g: '10.5', carbohydrates_100g: '20', fat_100g: '5' },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.macrosPer100g.proteinG).toBe(10.5)
        expect(result.value.macrosPer100g.carbsG).toBe(20)
      }
    })

    it('accepte la virgule décimale française', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            product_name: 'Produit virgule',
            nutriments: { proteins_100g: '3,5', carbohydrates_100g: 0, fat_100g: 0 },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.macrosPer100g.proteinG).toBe(3.5)
      }
    })

    it('complète par zéro les macros manquantes dès qu’une seule est connue', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            product_name: 'Huile',
            nutriments: { fat_100g: 100 },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.macrosPer100g.fatG).toBe(100)
        expect(result.value.macrosPer100g.proteinG).toBe(0)
      }
    })

    it('refuse un produit sans aucune donnée nutritionnelle', async () => {
      // L'accepter créerait une fiche à zéro calorie qui fausserait
      // silencieusement tous les totaux du joueur.
      const provider = providerWith(
        fetchReturning({ status: 1, product: { product_name: 'Fiche vide' } }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
    })

    it('refuse un produit sans nom', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: { nutriments: { proteins_100g: 10, carbohydrates_100g: 1, fat_100g: 1 } },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
    })

    it('rejette un JSON de forme totalement étrangère', async () => {
      const provider = providerWith(fetchReturning({ status: 'inattendu' }))

      const result = await provider.findByBarcode('1234567890123')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('EXTERNAL_PAYLOAD_INVALID')
    })

    it('ignore les valeurs nutritionnelles non numériques', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            product_name: 'Produit sale',
            nutriments: { proteins_100g: 'inconnu', carbohydrates_100g: 20, fat_100g: null },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.macrosPer100g.proteinG).toBe(0)
        expect(result.value.macrosPer100g.carbsG).toBe(20)
      }
    })

    it('préfère le nom français et y adjoint la marque', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            product_name: 'Sliced bread',
            product_name_fr: 'Pain de mie',
            brands: 'Harrys, Autre',
            nutriments: { proteins_100g: 8, carbohydrates_100g: 48, fat_100g: 4 },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.name).toBe('Pain de mie (Harrys)')
      }
    })

    it('n’ajoute pas la marque quand le nom la contient déjà', async () => {
      const provider = providerWith(
        fetchReturning({
          status: 1,
          product: {
            product_name: 'Nutella',
            brands: 'Nutella, Ferrero',
            nutriments: { proteins_100g: 6, carbohydrates_100g: 57, fat_100g: 31 },
          },
        }),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) expect(result.value.name).toBe('Nutella')
    })
  })

  describe('nutriments complémentaires', () => {
    const productWith = (nutriments: Record<string, unknown>): unknown => ({
      status: 1,
      product: {
        code: '1234567890123',
        product_name: 'Produit contribué',
        nutriments: { proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 3, ...nutriments },
      },
    })

    it('extrait fibres, sucres, AG saturés et sel', async () => {
      const provider = providerWith(
        fetchReturning(
          productWith({
            fiber_100g: 2.4,
            sugars_100g: 8,
            'saturated-fat_100g': 1.2,
            salt_100g: 0.9,
          }),
        ),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.detailPer100g.toJSON()).toEqual({
          fiberG: 2.4,
          sugarsG: 8,
          saturatedFatG: 1.2,
          saltG: 0.9,
        })
      }
    })

    it('reconstitue le sel à partir du sodium quand il manque', async () => {
      // Open Food Facts publie souvent l'un sans l'autre. Le facteur 2,5 est
      // celui du règlement UE 1169/2011.
      const provider = providerWith(fetchReturning(productWith({ sodium_100g: 0.4 })))

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.detailPer100g.saltG).toBeCloseTo(1, 9)
      }
    })

    it('préfère le sel déclaré au sodium quand les deux existent', async () => {
      const provider = providerWith(
        fetchReturning(productWith({ salt_100g: 0.5, sodium_100g: 0.4 })),
      )

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.detailPer100g.saltG).toBe(0.5)
      }
    })

    it('accepte un produit qui n’en déclare aucun', async () => {
      // Leur absence ne doit pas faire échouer la fiche : une base contributive
      // est lacunaire par nature, et un refus vaudrait moins qu'un à-peu-près.
      const provider = providerWith(fetchReturning(productWith({})))

      const result = await provider.findByBarcode('1234567890123')

      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.detailPer100g.isZero()).toBe(true)
      }
    })

    it('ramène à zéro une valeur négative contribuée par erreur', async () => {
      const provider = providerWith(
        fetchReturning(productWith({ fiber_100g: -3, salt_100g: -1 })),
      )

      const result = await provider.findByBarcode('1234567890123')

      // Sans cette borne, le VO rejetterait la valeur et ferait échouer toute
      // la fiche pour une seule saisie aberrante.
      expect(isOk(result)).toBe(true)
      if (isOk(result) && result.value !== null) {
        expect(result.value.detailPer100g.fiberG).toBe(0)
        expect(result.value.detailPer100g.saltG).toBe(0)
      }
    })
  })

  describe('recherche par nom', () => {
    it('traduit une réponse réelle de /cgi/search.pl', async () => {
      const provider = providerWith(fetchReturning(searchFixture))

      const result = await provider.searchByName('riz complet', 4)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toHaveLength(4)
      expect(result.value.map((item) => item.name)).toContain('Galettes riz complet Bio (Bjorg)')
      expect(result.value[0]?.source).toBe(FoodSource.OPEN_FOOD_FACTS)
      expect(result.value.every((item) => item.barcode !== undefined)).toBe(true)
    })

    it('demande le nombre de fiches voulu et la recherche simple', async () => {
      const fetchImpl = vi.fn(async () => jsonResponse(searchFixture)) as unknown as typeof fetch

      await providerWith(fetchImpl).searchByName('riz complet', 7)

      const url = String(vi.mocked(fetchImpl).mock.calls[0]?.[0])
      expect(url).toContain('/cgi/search.pl?')
      expect(url).toContain('search_terms=riz+complet')
      expect(url).toContain('page_size=7')
    })

    it('écarte les fiches inexploitables sans perdre les autres', async () => {
      const provider = providerWith(
        fetchReturning({
          products: [
            { code: '10000000001', product_name: '', nutriments: {} },
            {
              code: '10000000002',
              product_name: 'Bon produit',
              nutriments: { proteins_100g: 8 },
            },
            { code: '10000000003', nutriments: { proteins_100g: 4 } },
            { code: '10000000004', product_name: 'Sans nutriments', nutriments: {} },
          ],
        }),
      )

      const result = await provider.searchByName('x', 10)

      expect(isOk(result)).toBe(true)
      // Sur une base contributive, un ou deux déchets par page sont la norme :
      // refuser le lot priverait l'utilisateur de tout le reste.
      if (isOk(result)) expect(result.value.map((item) => item.name)).toEqual(['Bon produit'])
    })

    it('écarte une fiche dont le code n’est pas un code-barres valide', async () => {
      const provider = providerWith(
        fetchReturning({
          products: [{ code: '42', product_name: 'Code tronqué', nutriments: { fat_100g: 3 } }],
        }),
      )

      const result = await provider.searchByName('x', 10)

      // La garder sans code-barres serait pire : rien ne permettrait de
      // reconnaître le même produit d'une recherche à l'autre, et le catalogue
      // local accumulerait des doublons à chaque requête.
      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toEqual([])
    })

    it('accepte une réponse sans produits', async () => {
      const result = await providerWith(fetchReturning({ count: 0 })).searchByName('xyzzy', 10)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toEqual([])
    })

    it('ne sort pas sur le réseau pour une requête vide', async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch

      const result = await providerWith(fetchImpl).searchByName('   ', 10)

      expect(isOk(result)).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('traduit le quota dépassé en indisponibilité, pas en erreur de recherche', async () => {
      // `/cgi/search.pl` est nettement plus limité en débit que la lecture par
      // code-barres : le 503 est un cas courant, pas un incident.
      const result = await providerWith(fetchReturning({}, 503)).searchByName('riz', 10)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('REMOTE_UNAVAILABLE')
    })

    it('ne tente rien hors connexion', async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch

      const result = await providerWith(fetchImpl, false).searchByName('riz', 10)

      expect(isErr(result)).toBe(true)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    describe('nouvelle tentative', () => {
      it('retente une fois une recherche refusée, et rend le second résultat', async () => {
        const fetchImpl = vi
          .fn()
          .mockResolvedValueOnce(jsonResponse({}, 503))
          .mockResolvedValueOnce(jsonResponse(searchFixture)) as unknown as typeof fetch

        const result = await providerWith(fetchImpl).searchByName('riz complet', 4)

        expect(isOk(result)).toBe(true)
        expect(fetchImpl).toHaveBeenCalledTimes(2)
      })

      it('retente aussi quand le navigateur ne voit qu’une panne réseau', async () => {
        // Le 503 d'Open Food Facts arrive sans en-têtes CORS : dans un
        // navigateur, `fetch` lève « Failed to fetch » au lieu de rendre le statut.
        const fetchImpl = vi
          .fn()
          .mockRejectedValueOnce(new TypeError('Failed to fetch'))
          .mockResolvedValueOnce(jsonResponse(searchFixture)) as unknown as typeof fetch

        expect(isOk(await providerWith(fetchImpl).searchByName('riz', 4))).toBe(true)
      })

      it('ne retente qu’une fois, pour ne pas charger un service saturé', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch

        const result = await providerWith(fetchImpl).searchByName('riz', 4)

        expect(isErr(result) && result.error.code).toBe('REMOTE_UNAVAILABLE')
        expect(fetchImpl).toHaveBeenCalledTimes(2)
      })

      it('ne retente pas après un délai dépassé', async () => {
        const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
          await new Promise((_, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            ),
          )
          return jsonResponse({})
        }) as unknown as typeof fetch
        const provider = new OpenFoodFactsProvider(new StaticNetworkStatus(true), {
          fetchImpl,
          timeoutMs: 5,
          searchRetryDelayMs: 0,
        })

        await provider.searchByName('riz', 4)

        expect(fetchImpl).toHaveBeenCalledTimes(1)
      })

      it('ne retente pas la lecture par code-barres, qui n’est pas bridée', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch

        await providerWith(fetchImpl).findByBarcode('3017620422003')

        expect(fetchImpl).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('indisponibilité', () => {
    it('ne tente rien hors connexion', async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch
      const provider = providerWith(fetchImpl, false)

      const result = await provider.findByBarcode('3017620422003')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('REMOTE_UNAVAILABLE')
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('convertit une erreur serveur en indisponibilité', async () => {
      const provider = providerWith(fetchReturning({}, 503))

      const result = await provider.findByBarcode('3017620422003')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('REMOTE_UNAVAILABLE')
    })

    it('convertit une panne réseau en indisponibilité, sans lever', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch

      const result = await providerWith(fetchImpl).findByBarcode('3017620422003')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error.code).toBe('REMOTE_UNAVAILABLE')
    })

    it('abandonne au-delà du délai imparti', async () => {
      const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      }) as unknown as typeof fetch

      const provider = new OpenFoodFactsProvider(new StaticNetworkStatus(true), {
        fetchImpl,
        timeoutMs: 10,
      })

      const result = await provider.findByBarcode('3017620422003')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error.code).toBe('REMOTE_UNAVAILABLE')
        expect(result.error.message).toContain('délai')
      }
    })
  })

  it('n’envoie que des en-têtes CORS « simples », pour éviter toute pré-vérification', async () => {
    // Un `User-Agent` personnalisé déclenchait dans Firefox une requête OPTIONS
    // avant chaque recherche, refusée une fois sur deux par Open Food Facts.
    const fetchImpl = vi.fn(async () => jsonResponse(searchFixture)) as unknown as typeof fetch

    await providerWith(fetchImpl).searchByName('riz', 4)
    await providerWith(fetchImpl).findByBarcode('3017620422003')

    for (const [, init] of vi.mocked(fetchImpl).mock.calls as unknown as [unknown, RequestInit][]) {
      expect(Object.keys(init.headers ?? {})).toEqual(['Accept'])
    }
  })

  it('restreint les champs demandés à l’API', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(nutellaFixture)) as unknown as typeof fetch

    await providerWith(fetchImpl).findByBarcode('3017620422003')

    const url = vi.mocked(fetchImpl).mock.calls[0]?.[0] as string
    // La réponse complète pèse ~150 Ko contre ~3 Ko filtrée : oublier ce
    // paramètre passerait inaperçu en test mais coûterait cher sur mobile.
    expect(url).toContain('fields=')
    expect(url).toContain('nutriments')
  })
})
