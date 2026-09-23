<script setup lang="ts">
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
      <p
        class="account__mark"
        aria-hidden="true"
      >
        🥄
      </p>
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
      aria-label="Autres options"
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
  margin: 0 auto;
}

.account__header {
  text-align: center;
}

.account__mark {
  margin: 0;
  font-size: 3rem;
  line-height: 1;
}

.account__title {
  margin: var(--space-2) 0;
}

.account__intro {
  margin: 0;
  color: var(--color-text-muted);
}

.account__links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2) var(--space-4);
}

/* Cibles d'au moins 44 px, comme les boutons (critère 2.5.8, au-delà du minimum). */
.account__links :deep(a) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
</style>
