<script setup lang="ts">
/**
 * Question bloquante, posée dans une fenêtre modale : « Quitter sans
 * enregistrer ? ».
 *
 * C'est un `<dialog>` natif ouvert par `showModal()` : le navigateur rend le
 * reste de la page inerte, garde le focus dedans, ferme sur Échap et rend le
 * focus à l'élément d'où l'on venait. Rien de tout cela n'est refait à la main.
 *
 * Le focus s'ouvre sur **la réponse sans risque** (« Rester ») : une touche
 * Entrée machinale ne doit pas jeter le travail de quelqu'un.
 *
 * `ask()` rend une promesse : `true` si la personne confirme, `false` sinon
 * (bouton, Échap ou fermeture).
 */
import { ref, useId } from 'vue'

defineProps<{
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const cancel = ref<HTMLButtonElement | null>(null)
const titleId = useId()
const messageId = useId()

let settle: ((answer: boolean) => void) | null = null

function ask(): Promise<boolean> {
  settle?.(false)
  return new Promise((resolve) => {
    settle = resolve
    dialog.value?.showModal()
    cancel.value?.focus()
  })
}

function answer(value: boolean): void {
  const resolve = settle
  settle = null
  if (dialog.value?.open) dialog.value.close()
  resolve?.(value)
}

defineExpose({ ask })
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
    @cancel.prevent="answer(false)"
    @close="answer(false)"
  >
    <h2
      :id="titleId"
      class="confirm-dialog__title"
    >
      {{ title }}
    </h2>
    <p
      :id="messageId"
      class="confirm-dialog__message"
    >
      {{ message }}
    </p>
    <div class="confirm-dialog__actions">
      <button
        ref="cancel"
        type="button"
        class="confirm-dialog__button confirm-dialog__button--stay"
        @click="answer(false)"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="confirm-dialog__button confirm-dialog__button--leave"
        @click="answer(true)"
      >
        {{ confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.confirm-dialog {
  width: min(24rem, calc(100vw - 2rem));
  padding: var(--space-5);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-md);
  color: var(--color-text);
}

/* Le fond assombri dit que la page attend une réponse. */
.confirm-dialog::backdrop {
  background: rgb(31 38 32 / 45%);
}

.confirm-dialog__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lg);
}

.confirm-dialog__message {
  margin: 0 0 var(--space-5);
  color: var(--color-text-muted);
}

.confirm-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.confirm-dialog__button {
  min-height: 3.25rem;
  padding: var(--space-2) var(--space-5);
  border: 2px solid transparent;
  border-radius: var(--radius-pill);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.confirm-dialog__button--stay {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.confirm-dialog__button--leave {
  background: transparent;
  border-color: var(--color-danger);
  color: var(--color-danger);
}

@media (forced-colors: active) {
  .confirm-dialog__button {
    border-color: ButtonText;
  }
}
</style>
