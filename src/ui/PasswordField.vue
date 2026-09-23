<script setup lang="ts">
/**
 * Champ de mot de passe.
 *
 * Le bouton « Afficher » laisse relire une saisie faite à l'aveugle — c'est ce
 * que recommande le critère 3.3.8 (authentification accessible) plutôt que de
 * faire retaper le mot de passe deux fois. Le collage n'est jamais bloqué : un
 * gestionnaire de mots de passe doit pouvoir remplir le champ.
 *
 * `autocomplete` distingue `current-password` (connexion) de `new-password`
 * (inscription, réinitialisation) : c'est ce qui déclenche, ou non, la
 * suggestion d'un mot de passe fort par le navigateur.
 */
import { ref } from 'vue'

import BaseField from './BaseField.vue'

withDefaults(
  defineProps<{
    label: string
    modelValue: string
    autocomplete: 'current-password' | 'new-password'
    hint?: string
    error?: string
    required?: boolean
  }>(),
  { required: false },
)

defineEmits<{ 'update:modelValue': [string] }>()

const visible = ref(false)
</script>

<template>
  <BaseField
    :label="label"
    :model-value="modelValue"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :required="required"
    verbatim
    v-bind="{ ...(hint === undefined ? {} : { hint }), ...(error === undefined ? {} : { error }) }"
    @update:model-value="$emit('update:modelValue', String($event))"
  >
    <template #trailing="{ inputId }">
      <button
        type="button"
        class="password__toggle"
        :aria-controls="inputId"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        {{ visible ? 'Masquer' : 'Afficher' }}
        <span class="sr-only">le mot de passe</span>
      </button>
    </template>
  </BaseField>
</template>

<style scoped lang="scss">
.password__toggle {
  min-width: 44px;
  min-height: 44px;
  margin-right: calc(var(--space-2) * -1);
  padding: 0 var(--space-2);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
}

.password__toggle:focus-visible {
  outline-offset: -2px;
}
</style>
