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
import AppIcon from '@/ui/AppIcon.vue'
import BaseButton from '@/ui/BaseButton.vue'
import BrandMark from '@/ui/BrandMark.vue'
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
      <BrandMark
        size="lg"
        :with-name="false"
      />
      <h1>{{ t('shell.welcome.title') }} <span lang="en">Holy Spoon</span></h1>
      <p class="auth__intro">
        {{ t('shell.welcome.intro') }}
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <!-- Les deux chemins, à égalité : deux cartes de même poids. -->
    <div class="auth__paths">
      <section
        class="path"
        aria-labelledby="sans-compte"
      >
        <span
          class="path__icon"
          aria-hidden="true"
        >
          <AppIcon name="today" />
        </span>
        <h2 id="sans-compte">
          {{ players.player ? t('shell.welcome.resumeTitle') : t('shell.welcome.startTitle') }}
        </h2>
        <p class="path__text">
          {{
            players.player
              ? t('shell.welcome.resumeSubtitle', { name: players.player.name })
              : t('shell.welcome.startSubtitle')
          }}
        </p>
        <BaseButton
          block
          @click="router.push({ name: players.player ? ROUTE.dashboard : ROUTE.profileSetup })"
        >
          {{ players.player ? t('shell.welcome.resume') : t('shell.welcome.start') }}
        </BaseButton>
      </section>

      <section
        class="path"
        aria-labelledby="avec-compte"
      >
        <span
          class="path__icon"
          aria-hidden="true"
        >
          <AppIcon name="household" />
        </span>
        <h2 id="avec-compte">
          {{ account.session ? t('shell.welcome.accountTitle') : t('shell.welcome.withAccountTitle') }}
        </h2>
        <p class="path__text">
          {{
            account.session
              ? t('shell.welcome.signedInAs', { email: account.session.email })
              : t('shell.welcome.withAccountSubtitle')
          }}
        </p>
        <div
          v-if="!account.session"
          class="path__actions"
        >
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
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth {
  display: flex;
  min-height: 70dvh;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-6);
  max-width: 44rem;
  width: 100%;
  margin: 0 auto;
}

.auth__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;

  h1 {
    margin: var(--space-2) 0 0;
    overflow-wrap: break-word;
  }
}

.auth__intro {
  max-width: 32rem;
  margin: 0;
  color: var(--color-text-muted);
}

/* Côte à côte s'il y a la place, l'une sous l'autre sinon. */
.auth__paths {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--space-4);
}

.path {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--card-padding);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);

  h2 {
    margin: 0;
    font-size: var(--font-size-xl);
  }
}

.path__icon {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.path__text {
  flex: 1;
  margin: 0;
  color: var(--color-text-muted);
  overflow-wrap: break-word;
}

.path__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);

  > * {
    flex: 1 1 9rem;
  }
}
</style>
