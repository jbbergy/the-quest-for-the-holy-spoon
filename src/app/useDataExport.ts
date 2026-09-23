import { computed, type ComputedRef, ref } from 'vue'

import type { AppContainer } from '@/app/composition'
import { useContainer } from '@/app/container'
import {
  buildExport,
  exportFileName,
  type HolySpoonExport,
} from '@/app/dataExport'
import { downloadJson } from '@/app/download'
import { ApplicationError, type BaseError, type ErrorView, toErrorView } from '@/core/errors'
import { err, ok, type Result } from '@/core/result'
import { toPlayerExport } from '@/modules/player_profile/application'

/**
 * Rassemble les données des deux contextes qui appartiennent à l'utilisateur.
 *
 * Comme `useDailyTracking`, ce module vit dans `src/app/` parce qu'il connaît
 * plusieurs contextes — et chacun n'est atteint que par sa façade. Aucun accès
 * direct à IndexedDB ici : l'archive passe par le domaine, ce qui lui évite
 * d'hériter des champs devenus orphelins dans les enregistrements stockés.
 *
 * Le conteneur est un paramètre explicite plutôt qu'un appel à `useContainer()`,
 * pour que la collecte soit vérifiable sans monter l'application.
 */
export async function collectExport(
  container: AppContainer,
  exportedAt: Date,
): Promise<Result<HolySpoonExport, BaseError>> {
  const current = await container.profile.getCurrent.execute()
  if (!current.ok) return current
  if (current.value === null) {
    return err(
      new ApplicationError('NO_CURRENT_PROFILE', 'Aucun profil actif à exporter.'),
    )
  }
  const player = current.value

  const inventory = await container.inventory.exportData.execute(player.id)
  if (!inventory.ok) return inventory

  return ok(
    buildExport(
      {
        player: toPlayerExport(player),
        meals: inventory.value.meals,
        customFoods: inventory.value.customFoods,
      },
      exportedAt,
    ),
  )
}

export interface DataExport {
  readonly busy: ComputedRef<boolean>
  readonly error: ComputedRef<ErrorView | null>
  /** Nom du dernier fichier produit, pour l'annoncer en région `aria-live`. */
  readonly lastFileName: ComputedRef<string | null>
  run(): Promise<boolean>
}

export function useDataExport(): DataExport {
  const busy = ref(false)
  const failure = ref<ErrorView | null>(null)
  const fileName = ref<string | null>(null)

  async function run(): Promise<boolean> {
    if (busy.value) return false
    busy.value = true
    failure.value = null
    fileName.value = null

    try {
      const now = new Date()
      const archive = await collectExport(useContainer(), now)
      if (!archive.ok) {
        failure.value = toErrorView(archive.error)
        return false
      }

      const name = exportFileName(now)
      const saved = downloadJson(name, archive.value)
      if (!saved.ok) {
        failure.value = toErrorView(saved.error)
        return false
      }

      fileName.value = name
      return true
    } finally {
      busy.value = false
    }
  }

  return {
    busy: computed(() => busy.value),
    error: computed(() => failure.value),
    lastFileName: computed(() => fileName.value),
    run,
  }
}
