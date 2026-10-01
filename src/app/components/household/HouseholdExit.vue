<script setup lang="ts">
/**
 * Quitter le foyer, le dissoudre, ou en retirer quelqu'un : des gestes repliés
 * en bas, à l'écart, et confirmés avant d'agir.
 */
import { computed } from 'vue'

import { useHousehold } from '@/app/useHousehold'
import { t } from '@/i18n'
import type { HouseholdMemberView, HouseholdView } from '@/modules/household/application'
import AppIcon from '@/ui/AppIcon.vue'
import ConfirmButton from '@/ui/ConfirmButton.vue'

const props = defineProps<{
  household: HouseholdView
  /** Lance une action du foyer et annonce sa réussite, dans l'écran parent. */
  run: (action: () => Promise<boolean>, success: string) => Promise<void>
}>()

const store = useHousehold()
const busy = computed(() => store.status === 'loading')

const nameOf = (member: HouseholdMemberView): string => member.name ?? member.email

const removable = computed(() =>
  store.isOwner ? props.household.members.filter((member) => !member.isOwner) : [],
)

const remove = (member: HouseholdMemberView) =>
  props.run(() => store.removeMember(member.accountId), t('household.removed', { name: nameOf(member) }))

const leave = () => props.run(() => store.leave(), t('household.left'))
const dissolve = () => props.run(() => store.dissolve(), t('household.dissolved'))
</script>

<template>
  <section
    class="list-group"
    aria-labelledby="foyer-quitter"
  >
    <h2
      id="foyer-quitter"
      class="eyebrow list-group__title"
    >
      {{ t('household.exitTitle') }}
    </h2>
    <ul class="list-rows">
      <li v-if="removable.length > 0">
        <details class="danger">
          <summary class="list-row list-row--link danger__summary">
            <span class="list-row__label">{{ t('household.removeTitle') }}</span>
            <AppIcon
              name="chevron-down"
              class="list-row__chevron danger__chevron"
            />
          </summary>
          <ul class="danger__members">
            <li
              v-for="member in removable"
              :key="member.accountId"
              class="danger__member"
            >
              <span class="danger__name">
                {{ nameOf(member) }}
                <span
                  v-if="member.name !== null"
                  class="danger__email"
                >{{ member.email }}</span>
              </span>
              <ConfirmButton
                size="sm"
                :question="t('household.removeQuestion', { name: nameOf(member) })"
                :confirm-label="t('household.remove')"
                @confirm="remove(member)"
              >
                {{ t('household.remove') }}
              </ConfirmButton>
            </li>
          </ul>
        </details>
      </li>
      <li>
        <details class="danger">
          <summary class="list-row list-row--link danger__summary">
            <span class="list-row__label">
              {{ store.isOwner ? t('household.dissolveTitle') : t('household.leaveTitle') }}
            </span>
            <AppIcon
              name="chevron-down"
              class="list-row__chevron danger__chevron"
            />
          </summary>
          <div class="danger__body">
            <p class="list-row__hint">
              {{ store.isOwner ? t('household.dissolveText') : t('household.leaveText') }}
            </p>
            <ConfirmButton
              v-if="store.isOwner"
              :question="t('household.dissolveQuestion', { name: household.name })"
              :confirm-label="t('household.dissolve')"
              :loading="busy"
              @confirm="dissolve"
            >
              {{ t('household.dissolve') }}
            </ConfirmButton>
            <ConfirmButton
              v-else
              :question="t('household.leaveQuestion', { name: household.name })"
              :confirm-label="t('household.leaveConfirm')"
              :loading="busy"
              @confirm="leave"
            >
              {{ t('household.leave') }}
            </ConfirmButton>
          </div>
        </details>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
/* Un groupe (`styles/_list-rows.scss`) : ici plus aéré, titre compris. */
.list-group {
  gap: var(--space-3);
}

.list-group__title {
  margin-bottom: calc(-1 * var(--space-1));
}

/* Lignes : sur une seule rangée, le nom puis son détail en colonne. */
.list-row {
  flex-wrap: nowrap;
  gap: var(--space-3);
}

.list-row__label {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.danger__summary {
  list-style: none;
  color: var(--color-danger);
  font-weight: 700;

  &::-webkit-details-marker {
    display: none;
  }

  &:hover {
    color: var(--color-danger);
  }
}

.danger__chevron {
  transition: transform var(--duration-fast) var(--ease-out);
}

.danger[open] .danger__chevron {
  transform: rotate(180deg);
}

.danger__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 0 var(--space-4) var(--space-4);
}

.danger__members {
  margin: 0;
  padding: 0 var(--space-4) var(--space-2);
  list-style: none;
}

.danger__member {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0;

  & + & {
    border-top: 1px solid var(--color-divider);
  }
}

.danger__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-wrap: break-word;
}

/* L'adresse lève le doute entre deux prénoms identiques, avant de retirer. */
.danger__email {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}
</style>
