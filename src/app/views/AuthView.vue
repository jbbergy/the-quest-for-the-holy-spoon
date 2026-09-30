<script setup lang="ts">
/**
 * Accueil : avec ou sans compte.
 *
 * Le compte est **facultatif**. Sans lui, tout reste sur l'appareil, comme
 * avant ; avec lui, les repas suivent la personne d'un appareil à l'autre et le
 * foyer devient possible. Les deux chemins sont présentés à égalité : l'usage
 * local n'est pas un mode dégradé.
 */
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
import { useAccountStore } from '@/modules/account/presentation/useAccountStore'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const router = useRouter()
const players = usePlayerStore()
const account = useAccountStore()

onMounted(async () => {
  if (players.status === 'idle') await players.load()
})
</script>

<template>
  <div class="auth">
    <header class="auth__header">
      <p
        class="auth__mark"
        aria-hidden="true"
      >
        🥄
      </p>
      <h1>{{ t('shell.welcome.title') }} <span lang="en">Holy Spoon</span></h1>
      <p class="auth__intro">
        {{ t('shell.welcome.intro') }}
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <BaseCard
      v-if="players.player"
      :title="t('shell.welcome.resumeTitle')"
      :subtitle="t('shell.welcome.resumeSubtitle', { name: players.player.name })"
    >
      <BaseButton
        block
        @click="router.push({ name: ROUTE.dashboard })"
      >
        {{ t('shell.welcome.resume') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      v-else
      :title="t('shell.welcome.startTitle')"
      :subtitle="t('shell.welcome.startSubtitle')"
    >
      <BaseButton
        block
        @click="router.push({ name: ROUTE.profileSetup })"
      >
        {{ t('shell.welcome.start') }}
      </BaseButton>
    </BaseCard>

    <BaseCard
      v-if="account.session"
      :title="t('shell.welcome.accountTitle')"
      :subtitle="t('shell.welcome.signedInAs', { email: account.session.email })"
    />
    <BaseCard
      v-else
      :title="t('shell.welcome.withAccountTitle')"
      :subtitle="t('shell.welcome.withAccountSubtitle')"
    >
      <div class="auth__actions">
        <BaseButton
          variant="secondary"
          @click="router.push({ name: ROUTE.signIn })"
        >
          {{ t('shell.welcome.signIn') }}
        </BaseButton>
        <BaseButton
          variant="secondary"
          @click="router.push({ name: ROUTE.signUp })"
        >
          {{ t('shell.welcome.signUp') }}
        </BaseButton>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped lang="scss">
.auth {
  display: flex;
  min-height: 70dvh;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-5);
}

.auth__header {
  text-align: center;
}

.auth__mark {
  margin: 0;
  font-size: 3rem;
  line-height: 1;
}

.auth__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.auth__intro {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
