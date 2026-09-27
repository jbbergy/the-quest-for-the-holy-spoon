import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { DayKey } from '@/core/day'

/**
 * Jours dépliés dans la semaine.
 *
 * Tous repliés au lancement : la semaine se lit d'abord comme sept lignes et
 * leurs totaux. Ce qu'on déplie reste déplié le temps de la session — en
 * changeant d'onglet ou de semaine puis en revenant — mais pas au-delà :
 * l'état vit en mémoire, jamais dans le stockage de l'appareil.
 */
export const useOpenDaysStore = defineStore('openDays', () => {
  const open = ref<ReadonlySet<DayKey>>(new Set())

  function isOpen(day: DayKey): boolean {
    return open.value.has(day)
  }

  function setOpen(day: DayKey, isNowOpen: boolean): void {
    const next = new Set(open.value)
    if (isNowOpen) next.add(day)
    else next.delete(day)
    open.value = next
  }

  return { isOpen, setOpen }
})
