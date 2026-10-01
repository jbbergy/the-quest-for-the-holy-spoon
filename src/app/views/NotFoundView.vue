<script setup lang="ts">
/**
 * Adresse qui ne mène à aucun écran : un favori d'avant un changement, un lien
 * coupé en le copiant. On le dit, plutôt que de renvoyer sans un mot à
 * l'accueil — la personne croirait que le lien marche et que l'application a
 * perdu ce qu'elle cherchait.
 *
 * Plein écran et accessible sans profil : l'issue mène à l'accueil, qui
 * choisit lui-même entre le profil, sa création et la connexion.
 */
import AccountLayout from '@/app/components/AccountLayout.vue'
import { ROUTE } from '@/app/router'
import { t } from '@/i18n'
</script>

<template>
  <AccountLayout
    :title="t('shell.notFound.title')"
    :intro="t('shell.notFound.intro')"
  >
    <template #links>
      <RouterLink :to="{ name: ROUTE.splash }">
        {{ t('shell.notFound.home') }}
      </RouterLink>
    </template>
  </AccountLayout>
</template>
