<script setup lang="ts">
/**
 * Création du profil : le seul formulaire long de l'application.
 *
 * Le formulaire (`ProfileForm`) vérifie que rien ne manque ; la plausibilité
 * reste celle du domaine, remontée par le use case. Dupliquer les bornes
 * physiologiques ici garantirait qu'elles divergent un jour.
 */
import { useRouter } from 'vue-router'

import ProfileForm, { type ProfileFormValues } from '@/app/components/ProfileForm.vue'
import { ROUTE } from '@/app/router'
import { useAccountSync } from '@/app/useAccountSync'
import { t } from '@/i18n'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const router = useRouter()
const players = usePlayerStore()
const { connect } = useAccountSync()

async function submit(values: ProfileFormValues): Promise<void> {
  const created = await players.create(values)
  if (!created) return
  // Connecté avant d'avoir un profil : le nouveau profil rejoint le compte.
  await connect()
  await router.push({ name: ROUTE.dashboard })
}
</script>

<template>
  <div class="setup">
    <header>
      <h1>{{ t('profile.setup.title') }}</h1>
      <p class="setup__intro">
        {{ t('profile.setup.intro1') }}
      </p>
      <p class="setup__intro">
        {{ t('profile.setup.intro2') }}
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <ProfileForm
      :submit-label="t('profile.setup.submit')"
      :busy="players.status === 'loading'"
      @submit="submit"
    />
  </div>
</template>

<style scoped lang="scss">
.setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.setup__intro {
  color: var(--color-text-muted);
}
</style>
