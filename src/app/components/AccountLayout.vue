<script setup lang="ts">
import { t } from '@/i18n'
import BrandMark from '@/ui/BrandMark.vue'

/**
 * Mise en page des écrans de compte : connexion, inscription, liens reçus par
 * e-mail. Plein écran, sans barre de navigation — comme l'accueil — mais
 * toujours avec une issue : les liens de pied de page ramènent à l'usage sans
 * compte.
 */
defineProps<{ title: string; intro?: string }>()
</script>

<template>
  <div class="account">
    <header class="account__header">
      <BrandMark class="account__mark" />
      <h1 class="account__title">
        {{ title }}
      </h1>
      <p
        v-if="intro"
        class="account__intro"
      >
        {{ intro }}
      </p>
    </header>

    <slot />

    <nav
      v-if="$slots.links"
      class="account__links"
      :aria-label="t('shell.account.otherOptions')"
    >
      <slot name="links" />
    </nav>
  </div>
</template>

<style scoped lang="scss">
.account {
  display: flex;
  min-height: 70dvh;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-5);
  max-width: 28rem;
  width: 100%;
  margin: 0 auto;
}

.account__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
}

.account__mark {
  margin-bottom: var(--space-3);
}

.account__title {
  margin: 0;
  overflow-wrap: break-word;
}

.account__intro {
  margin: 0;
  color: var(--color-text-muted);
}

/* Les autres chemins : une colonne de liens, chacun sur sa ligne. */
.account__links {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

/* Cibles d'au moins 44 px, comme les boutons (critère 2.5.8, au-delà du minimum). */
.account__links :deep(a) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  text-align: center;
}
</style>
