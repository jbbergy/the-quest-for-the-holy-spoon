<script setup lang="ts">
/**
 * Champ de saisie étiqueté.
 *
 * L'étiquette est **toujours** liée au champ par `for`/`id`, et le message
 * d'erreur par `aria-describedby`. Une erreur affichée visuellement mais non
 * rattachée au champ n'existe pas pour un lecteur d'écran : c'est le cas
 * d'échec le plus courant du critère 3.3.1.
 */
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string | number
    type?: 'text' | 'number' | 'email' | 'password'
    hint?: string
    error?: string
    required?: boolean
    min?: number
    max?: number
    step?: number
    autocomplete?: string
    placeholder?: string
    suffix?: string
  }>(),
  { type: 'text', required: false },
)

defineEmits<{ 'update:modelValue': [string | number] }>()

const id = useId()
const hintId = computed(() => `${id}-hint`)
const errorId = computed(() => `${id}-error`)

/** Les deux identifiants ne sont annoncés que s'ils correspondent à du contenu réel. */
const describedBy = computed(() => {
  const ids = [
    props.hint !== undefined && props.hint !== '' ? hintId.value : null,
    props.error !== undefined && props.error !== '' ? errorId.value : null,
  ].filter((value): value is string => value !== null)

  return ids.length === 0 ? undefined : ids.join(' ')
})

const onInput = (event: Event): string | number => {
  const target = event.target as HTMLInputElement
  return props.type === 'number' ? target.valueAsNumber : target.value
}
</script>

<template>
  <div class="field">
    <label
      class="field__label"
      :for="id"
    >
      {{ label }}
      <span
        v-if="required"
        class="field__required"
        aria-hidden="true"
      >*</span>
      <span
        v-if="required"
        class="sr-only"
      >(obligatoire)</span>
    </label>

    <div
      class="field__control"
      :class="{ 'field__control--invalid': error }"
    >
      <input
        :id="id"
        class="field__input"
        :type="type"
        :value="modelValue"
        :required="required"
        :min="min"
        :max="max"
        :step="step"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :aria-describedby="describedBy"
        :aria-invalid="error ? 'true' : undefined"
        @input="$emit('update:modelValue', onInput($event))"
      >
      <span
        v-if="suffix"
        class="field__suffix"
        aria-hidden="true"
      >{{ suffix }}</span>
    </div>

    <p
      v-if="hint"
      :id="hintId"
      class="field__hint"
    >
      {{ hint }}
    </p>
    <p
      v-if="error"
      :id="errorId"
      class="field__error"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text);
}

.field__required {
  color: var(--color-danger);
}

.field__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.field__control:focus-within {
  border-color: var(--color-accent);
}

.field__control--invalid {
  border-color: var(--color-danger);
}

.field__input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}

/**
 * L'anneau est dessiné **à l'intérieur** du champ plutôt que supprimé.
 *
 * Le masquer au profit de la seule bordure du conteneur reviendrait à faire
 * reposer l'indicateur de focus sur un changement de couleur de 1px — insuffisant
 * au regard du critère 2.4.13 de WCAG 2.2 — et supprimerait l'indicateur partout
 * où la bordure est déjà colorée par une erreur.
 */
.field__input:focus-visible {
  outline-offset: -2px;
}

.field__suffix {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.field__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.field__error {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-danger);
}
</style>
