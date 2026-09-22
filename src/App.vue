<script setup lang="ts">
/**
 * Coquille de l'application.
 *
 * Le thème est appliqué **avant le premier rendu** (dans `main.ts`) ; il n'y a
 * donc rien à faire ici, sinon brancher la navigation.
 */
import AppShell from '@/app/components/AppShell.vue'
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <component :is="Component" />
    </RouterView>
  </AppShell>
</template>
