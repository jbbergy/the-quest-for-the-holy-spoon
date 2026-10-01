<script setup lang="ts">
/**
 * Le foyer aujourd'hui : chaque membre a sa ligne — ce qu'il a mangé sur son
 * besoin, s'il partage ses journées, et le lien vers sa journée.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useTodayStore } from '@/app/day/useTodayStore'
import { useMembersToday } from '@/app/household/useMembersToday'
import { initials } from '@/app/initials'
import { ROUTE } from '@/app/router'
import { numberFormat, t } from '@/i18n'
import type { HouseholdMemberView, HouseholdView } from '@/modules/household/application'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import AppIcon from '@/ui/AppIcon.vue'
import MeterBar from '@/ui/MeterBar.vue'
import RichText from '@/ui/RichText.vue'

const props = defineProps<{ household: HouseholdView }>()

const account = useAccountStore()
const clock = useTodayStore()

const myAccountId = computed(() => account.session?.accountId ?? null)

const eaten = useMembersToday(
  () => props.household,
  () => myAccountId.value,
  () => clock.today,
)

const kcal = (value: number): string => numberFormat({ maximumFractionDigits: 0 }).format(value)
const nameOf = (member: HouseholdMemberView): string => member.name ?? member.email

/** Ce qu'une ligne de membre affiche ; une fonction plutôt qu'un gabarit à embranchements. */
interface MemberRow {
  readonly member: HouseholdMemberView
  readonly mine: boolean
  readonly label: string
  readonly avatar: string
  /** `self` : pastille Encre ; `shared` : safran ; `hidden` : en retrait. */
  readonly tone: 'self' | 'shared' | 'hidden'
  readonly link: { name: string; params?: Record<string, string> } | null
  readonly eaten: number | null
  readonly target: number | null
  /** Phrase à la place des chiffres : journée cachée, pas encore de profil. */
  readonly note: string | null
}

function rowOf(member: HouseholdMemberView): MemberRow {
  const mine = member.accountId === myAccountId.value
  const visible = member.playerId !== null && (mine || member.sharesDays)
  return {
    member,
    mine,
    label: mine ? t('household.you') : nameOf(member),
    avatar: initials(member.name ?? member.email),
    tone: mine ? 'self' : member.sharesDays ? 'shared' : 'hidden',
    link: !visible
      ? null
      : mine
        ? { name: ROUTE.dashboard }
        : { name: ROUTE.memberDay, params: { playerId: member.playerId! } },
    eaten: visible ? (eaten.value.get(member.playerId!) ?? null) : null,
    target: member.targetCalories,
    note: member.playerId === null
      ? t('household.noProfile')
      : !visible
        ? t('household.notShared')
        : null,
  }
}

const rows = computed(() => props.household.members.map(rowOf))
</script>

<template>
  <section
    class="list-group"
    aria-labelledby="foyer-aujourdhui"
  >
    <h2
      id="foyer-aujourdhui"
      class="list-group__heading"
    >
      {{ t('household.todayTitle') }}
    </h2>
    <ul class="members">
      <li
        v-for="row in rows"
        :key="row.member.accountId"
      >
        <component
          :is="row.link ? RouterLink : 'div'"
          v-bind="row.link ? { to: row.link } : {}"
          class="member"
          :class="{ 'member--link': row.link }"
        >
          <span
            class="member__avatar"
            :class="`member__avatar--${row.tone}`"
            aria-hidden="true"
          >{{ row.avatar }}</span>
          <span class="member__body">
            <span class="member__top">
              <span class="member__name">
                {{ row.label }}<span
                  v-if="row.member.isOwner"
                  class="member__tag"
                ><span class="sr-only">, </span>{{ t('household.ownerTag') }}</span>
              </span>
              <span
                v-if="row.eaten !== null && row.target !== null"
                class="member__figures"
              >
                <span aria-hidden="true"><strong>{{ kcal(row.eaten) }}</strong> / {{ kcal(row.target) }} kcal</span>
                <span class="sr-only">, {{ t('household.eatenSpoken', { eaten: kcal(row.eaten), target: kcal(row.target) }) }}</span>
              </span>
              <span
                v-else-if="row.eaten !== null"
                class="member__figures"
              >
                <span class="sr-only">, </span>{{ t('household.eatenOnly', { eaten: kcal(row.eaten) }) }}
              </span>
            </span>
            <MeterBar
              v-if="row.eaten !== null && row.target !== null"
              class="member__meter"
              :value="row.eaten"
              :target="row.target"
            />
            <span
              v-if="row.note"
              class="member__note"
            ><span class="sr-only">, </span>{{ row.note }}</span>
          </span>
          <AppIcon
            v-if="row.link"
            name="chevron-right"
            class="member__end"
          />
          <AppIcon
            v-else-if="row.member.playerId !== null"
            name="lock"
            class="member__end"
          />
        </component>
      </li>
    </ul>
    <p class="list-group__note">
      {{ household.role === 'owner' ? t('household.roleOwner') : t('household.roleMember') }}
      {{ ' ' }}<RichText :path="household.sharesDays ? 'household.sharesYes' : 'household.sharesNo'" />
      {{ ' ' }}<RouterLink :to="{ name: ROUTE.settings }">
        {{ t('household.changeInSettings') }}
      </RouterLink>
    </p>
  </section>
</template>

<style scoped lang="scss">
/* Un groupe (`styles/_list-rows.scss`) : ici plus aéré, titre compris. */
.list-group {
  gap: var(--space-3);
}

.list-group__heading {
  margin: 0;
}

/* Les membres : une carte, une ligne chacun. */
.members {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;

  > li + li {
    border-top: 1px solid var(--color-divider);
  }
}

.member {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 4.5rem;
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  font-weight: 400;
  text-decoration: none;
}

.member--link {
  &:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  &:focus-visible {
    outline-offset: -3px;
  }
}

.member__avatar {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.member__avatar--self {
  background: var(--color-inverse);
  color: var(--color-on-inverse);
}

.member__avatar--shared {
  background: var(--color-saffron);
  color: var(--color-on-saffron);
}

.member__avatar--hidden {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.member__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.member__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 var(--space-3);
}

.member__name {
  min-width: 0;
  font-weight: 700;
  overflow-wrap: break-word;
}

.member__tag {
  display: inline-block;
  margin-left: var(--space-2);
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 400;
}

.member__figures {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  strong {
    color: var(--color-text);
  }
}

.member__note {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.member__end {
  flex-shrink: 0;
  color: var(--color-text-muted);
}
</style>
