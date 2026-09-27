<script setup lang="ts">
/**
 * Modifier son profil : tout ce qui a été saisi à la création.
 *
 * Les besoins se recalculent d'eux-mêmes. Les portions des repas **prévus** à
 * partir d'aujourd'hui suivent le nouveau besoin ; les repas mangés et les
 * jours passés ne bougent pas (`useProfileEditing`). L'écran dit ce qui a
 * changé, pour que rien ne bouge sans qu'on le sache.
 */
import { computed, nextTick, ref } from 'vue'

import ProfileForm, { type ProfileFormValues } from '@/app/components/ProfileForm.vue'
import { ROUTE } from '@/app/router'
import { useProfileEditing } from '@/app/useProfileEditing'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import ErrorNotice from '@/ui/ErrorNotice.vue'

const players = usePlayerStore()
const editing = useProfileEditing()
const message = ref('')
const messageBox = ref<HTMLElement | null>(null)

const initial = computed<ProfileFormValues | null>(() => {
  const view = players.profileView
  if (view === null) return null
  return {
    name: view.name,
    heightCm: view.heightCm,
    weightKg: view.weightKg,
    ageYears: view.ageYears,
    biologicalSex: view.biologicalSex,
    activityLevel: view.activityLevel,
    restrictions: view.restrictions,
  }
})

async function submit(values: ProfileFormValues): Promise<void> {
  message.value = ''
  const before = Math.round(players.profileView?.targetCalories ?? 0)
  const outcome = await editing.save(values)
  if (outcome === null) return

  const after = Math.round(players.profileView?.targetCalories ?? 0)
  const lines = ['Votre profil est enregistré.']
  if (after !== before) {
    lines.push(`Votre besoin passe de ${before} à ${after} kcal par jour.`)
    lines.push('Les jours passés gardent l’ancien besoin.')
  }
  if (outcome.rescaledMeals > 0) {
    const count = outcome.rescaledMeals
    lines.push(
      `Les portions de ${count} repas prévu${count > 1 ? 's' : ''} ont été ajustées. Les repas déjà mangés ne changent pas.`,
    )
  }
  message.value = lines.join(' ')
  // Le bouton est en bas, le message en haut : on l'amène sous les yeux.
  await nextTick()
  messageBox.value?.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <div class="profile-edit">
    <RouterLink
      class="profile-edit__back"
      :to="{ name: ROUTE.settings }"
    >
      <span aria-hidden="true">←</span> Réglages
    </RouterLink>

    <h1>Modifier mon profil</h1>
    <p class="profile-edit__intro">
      Si vous changez votre corps ou votre activité, votre besoin est recalculé. Les portions de
      vos repas prévus s’ajustent aussi.
    </p>

    <ErrorNotice :error="players.error" />
    <ErrorNotice :error="editing.mealsError.value" />

    <p
      ref="messageBox"
      class="profile-edit__message"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </p>

    <ProfileForm
      v-if="initial"
      :key="players.playerId ?? ''"
      :initial="initial"
      submit-label="Enregistrer"
      :busy="editing.saving.value"
      @submit="submit"
    />
  </div>
</template>

<style scoped lang="scss">
.profile-edit {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profile-edit__back {
  align-self: flex-start;
}

.profile-edit h1,
.profile-edit__intro,
.profile-edit__message {
  margin: 0;
}

.profile-edit__intro {
  color: var(--color-text-muted);
}

.profile-edit__message {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
}

/* Vide, la région reste dans la page — sinon certains lecteurs d'écran ne
   l'annonceraient pas en se remplissant —, mais sans rien occuper. */
.profile-edit__message:empty {
  padding: 0;
}
</style>
