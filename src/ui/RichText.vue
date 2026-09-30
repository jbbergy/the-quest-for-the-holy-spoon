<script setup lang="ts">
/**
 * Un texte traduit qui contient des éléments de mise en forme.
 *
 * « Nous venons d'envoyer un lien à **camille@exemple.fr**. » : la place du mot
 * en gras change d'une langue à l'autre, donc la phrase ne peut pas être
 * découpée en morceaux dans le gabarit. Le texte reste **entier** dans les
 * traductions, avec deux sortes de repères :
 *
 * - `**gras**` devient un `<strong>` ;
 * - `{nom}` est rempli par l'emplacement (`<template #nom>`) du même nom, pour
 *   ce qui n'est pas du texte : une infobulle, un lien.
 *
 * Les valeurs simples (`params`) s'insèrent comme dans n'importe quelle
 * traduction. Aucun HTML dans les traductions : rien à assainir, rien qui casse
 * la mise en page si un traducteur se trompe.
 */
import { computed, useSlots } from 'vue'

import { t } from '@/i18n'

const props = defineProps<{
  /** Clé de traduction. */
  path: string
  /** Valeurs simples, insérées telles quelles. */
  params?: Record<string, string | number>
}>()

const slots = useSlots()

interface Part {
  readonly kind: 'text' | 'strong' | 'slot'
  readonly text: string
}

const parts = computed<readonly Part[]>(() => {
  // Un emplacement rempli devient un repère `{nom}` que l'on redécoupe ensuite.
  const markers = Object.fromEntries(Object.keys(slots).map((name) => [name, `{${name}}`]))
  const text = t(props.path, { ...props.params, ...markers })
  return text
    .split(/(\*\*[^*]+\*\*|\{\w+\})/)
    .filter((piece) => piece !== '')
    .map((piece): Part => {
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
        return { kind: 'strong', text: piece.slice(2, -2) }
      }
      const name = /^\{(\w+)\}$/.exec(piece)?.[1]
      return name !== undefined && name in slots
        ? { kind: 'slot', text: name }
        : { kind: 'text', text: piece }
    })
})
</script>

<template>
  <template
    v-for="(part, index) in parts"
    :key="index"
  >
    <slot
      v-if="part.kind === 'slot'"
      :name="part.text"
    />
    <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
    <template v-else>
      {{ part.text }}
    </template>
  </template>
</template>
