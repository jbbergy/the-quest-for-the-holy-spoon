<script setup lang="ts">
/**
 * Garder les aliments du repas en cours comme recette. Les recettes elles-mêmes
 * se retrouvent par la recherche d'aliments (voir `RecipeResults`).
 *
 * La carte ne connaît ni store ni Use Case : l'écran lui passe le geste.
 */
import { computed, ref } from 'vue'

import BaseButton from '@/ui/BaseButton.vue'
import BaseCard from '@/ui/BaseCard.vue'

const props = defineProps<{
  busy: boolean
  save: (name: string) => Promise<boolean>
}>()

const name = ref('')
const cleanName = computed(() => name.value.trim())

async function saveRecipe(): Promise<void> {
  if (cleanName.value === '') return
  if (await props.save(cleanName.value)) name.value = ''
}
</script>

<template>
  <BaseCard
    title="Garder comme recette"
    subtitle="La prochaine fois, cherchez la recette par son nom pour ajouter tous ses aliments."
  >
    <form
      class="save"
      @submit.prevent="saveRecipe"
    >
      <label class="save__field">
        <span class="save__label">Nom de la recette</span>
        <input
          v-model="name"
          type="text"
          maxlength="60"
          autocomplete="off"
          placeholder="Poke bowl"
        >
      </label>
      <BaseButton
        type="submit"
        variant="secondary"
        :disabled="busy || cleanName === ''"
      >
        Enregistrer la recette
      </BaseButton>
    </form>
  </BaseCard>
</template>

<style scoped lang="scss">
.save {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.save__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.save__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.save input {
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font: inherit;
}
</style>
