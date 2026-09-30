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

import { t } from '@/i18n'

import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string | number
    type?: 'text' | 'number' | 'email' | 'password' | 'search'
    hint?: string
    error?: string
    required?: boolean
    min?: number
    max?: number
    step?: number
    autocomplete?: string
    placeholder?: string
    suffix?: string
    /**
     * Saisie à reproduire telle quelle — adresse, mot de passe : ni correcteur
     * orthographique, ni majuscule automatique en début de champ, qui ferait
     * échouer une connexion sur mobile sans que rien ne l'explique.
     */
    verbatim?: boolean
  }>(),
  { type: 'text', required: false, verbatim: false },
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
      >{{ t('ui.required') }}</span>
    </label>

    <div
      class="field__control"
      :class="{ 'field__control--invalid': error }"
    >
      <slot name="leading" />
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
        :spellcheck="verbatim ? false : undefined"
        :autocapitalize="verbatim ? 'none' : undefined"
        :autocorrect="verbatim ? 'off' : undefined"
        @input="$emit('update:modelValue', onInput($event))"
      >
      <span
        v-if="suffix"
        class="field__suffix"
        aria-hidden="true"
      >{{ suffix }}</span>
      <slot
        name="trailing"
        :input-id="id"
      />
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
      <AppIcon
        name="alert"
        :size="1.15"
      />
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<style scoped lang="scss">
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field__label {
  font-weight: 700;
  color: var(--color-text);
}

.field__required {
  color: var(--color-danger);
}

/* La bordure délimite ce qu'on remplit : `border-strong`, au moins 3:1 sur
   le fond (critère 1.4.11), là où une nuance pâle rendrait le champ invisible. */
.field__control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) var(--ease-out);
}

/* L'erreur épaissit la bordure en plus de la colorer : la couleur seule ne
   suffit pas (critère 1.4.1), l'icône et le message font le reste. */
.field__control--invalid {
  border-color: var(--color-danger);
  box-shadow: inset 0 0 0 1px var(--color-danger);
}

/**
 * L'anneau de focus entoure **tout le champ**, suffixe et bouton compris,
 * comme sur les autres commandes : 3 px Encre, décalé de 2 px.
 *
 * Il est porté par le conteneur plutôt que par l'`<input>`, dont le contour
 * serait rogné par les bords arrondis. Le simple changement de couleur de la
 * bordure ne suffirait pas (critère 2.4.13 de WCAG 2.2), et disparaîtrait là
 * où la bordure est déjà colorée par une erreur.
 */
.field__control:has(.field__input:focus-visible) {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.field__input {
  flex: 1;
  min-width: 0;
  min-height: 3.125rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 1.0625rem;
}

.field__input:focus-visible {
  outline: none;
}

/* Navigateur sans `:has()` : l'anneau revient sur l'`<input>`, à l'intérieur. */
@supports not selector(:has(a)) {
  .field__input:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: -2px;
  }
}

.field__input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
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
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-danger);
}
</style>
