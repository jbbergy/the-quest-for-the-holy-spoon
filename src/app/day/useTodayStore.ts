import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { currentDay, type DayKey, nextDayStart } from '@/core/day'

import {
  type IDayStartPreference,
  isDayStartHour,
  LocalDayStartPreference,
} from './DayStartPreference'

/**
 * Marge après l'heure de bascule : un minuteur ne se déclenche jamais en
 * avance selon la norme, mais certains navigateurs arrondissent à la
 * milliseconde près — on préfère relire une seconde trop tard qu'une trop tôt.
 */
const ROLLOVER_MARGIN_MS = 1000
/** Plafond de `setTimeout` : au-delà, le délai déborde et part immédiatement. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/**
 * La journée en cours, pour toute l'application.
 *
 * Elle bascule d'elle-même à l'heure choisie — minuit par défaut — sans
 * recharger la page : les écrans qui l'observent se relisent. Un minuteur ne
 * suffit pas seul, car il s'endort avec l'appareil : le retour au premier plan
 * recalcule aussi la journée.
 */
export const useTodayStore = defineStore('today', () => {
  const preference = shallowRef<IDayStartPreference>(new LocalDayStartPreference())
  const clock = shallowRef<() => Date>(() => new Date())
  const startHour = ref(0)
  const today = ref<DayKey>(currentDay(new Date()))

  let timer: ReturnType<typeof setTimeout> | undefined
  let listening = false

  function refresh(): void {
    const now = clock.value()
    const day = currentDay(now, startHour.value)
    if (day !== today.value) today.value = day

    clearTimeout(timer)
    const delay = nextDayStart(now, startHour.value).getTime() - now.getTime()
    timer = setTimeout(refresh, Math.min(delay + ROLLOVER_MARGIN_MS, MAX_TIMEOUT_MS))
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') refresh()
  }

  /** Injection pour les tests ; le code applicatif n'appelle jamais ceci. */
  function configure(deps: { preference?: IDayStartPreference; clock?: () => Date }): void {
    if (deps.preference !== undefined) preference.value = deps.preference
    if (deps.clock !== undefined) clock.value = deps.clock
  }

  function initialize(): void {
    startHour.value = preference.value.read()
    refresh()
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      listening = true
    }
  }

  function setStartHour(hour: number): boolean {
    if (!isDayStartHour(hour)) return false
    startHour.value = hour
    preference.value.write(hour)
    refresh()
    return true
  }

  function stop(): void {
    clearTimeout(timer)
    timer = undefined
    if (listening) document.removeEventListener('visibilitychange', onVisibilityChange)
    listening = false
  }

  return { today, startHour, configure, initialize, setStartHour, refresh, stop }
})
