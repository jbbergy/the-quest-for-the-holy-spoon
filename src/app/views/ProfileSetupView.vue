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
      <h1>Créer mon profil</h1>
      <p class="setup__intro">
        L’application a besoin de quelques informations sur vous. Elle s’en sert pour calculer
        ce que votre corps dépense chaque jour.
      </p>
      <p class="setup__intro">
        Ces informations restent sur cet appareil. Si vous créez un compte, personne d’autre ne
        voit votre taille, votre poids ni votre âge.
      </p>
    </header>

    <ErrorNotice :error="players.error" />

    <ProfileForm
      submit-label="Créer mon profil"
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
