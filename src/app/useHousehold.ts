import { watch } from 'vue'

import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { useHouseholdStore } from '@/modules/household/presentation/useHouseholdStore'

/**
 * Le foyer du compte connecté, chargé dès que la session est connue.
 *
 * La session arrive souvent après le montage — elle est lue sans bloquer la
 * navigation — et le foyer ne peut se charger qu'avec elle. Deux contextes se
 * rencontrent : la coordination vit donc ici, dans `src/app/`, pas dans un store.
 */
export function useHousehold() {
  const account = useAccountStore()
  const household = useHouseholdStore()

  watch(
    () => account.session,
    (session) => {
      if (session !== null && household.status === 'idle') void household.load()
    },
    { immediate: true },
  )

  return household
}
