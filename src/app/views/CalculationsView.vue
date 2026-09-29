<script setup lang="ts">
/**
 * Comment sont calculés les repères : la page qui explique, pas à pas, d'où
 * viennent les chiffres — ceux des aliments et ceux de la personne.
 *
 * Les nombres de la personne sont **lus sur son profil**, pas recopiés : la
 * page montre son propre calcul, ce qui l'explique mieux qu'une formule seule.
 * Les constantes (répartition, repères, coefficients) viennent du domaine, si
 * bien que la page ne peut pas dire autre chose que le code.
 *
 * Les textes suivent les règles FALC du lexique : phrases courtes, une idée
 * par phrase, mots courants.
 */
import { computed } from 'vue'

import { ACTIVITY_OPTIONS } from '@/app/profileOptions'
import { ROUTE } from '@/app/router'
import { KCAL_PER_GRAM } from '@/core/nutrition/Macros'
import { RECENT_DAYS } from '@/modules/planning/domain/RecentIntakeService'
import { ACTIVITY_MULTIPLIER } from '@/modules/player_profile/domain/ActivityLevel'
import { BALANCED_MACRO_SPLIT, SATURATED_FAT_ENERGY_SHARE } from '@/modules/player_profile/domain/BalancedDiet'
import { BiologicalSex } from '@/modules/player_profile/domain/BodyMeasurements'
import { usePlayerStore } from '@/modules/player_profile/presentation/usePlayerStore'
import BaseCard from '@/ui/BaseCard.vue'

const players = usePlayerStore()
const view = computed(() => players.profileView)

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const percent = (share: number): string => `${number.format(share * 100)} %`

/** Un aliment d'exemple : 100 g de pâtes cuites, à peu près. */
const EXAMPLE = { proteinG: 5, carbsG: 25, fatG: 1, grams: 200 } as const
const exampleKcalPer100g =
  EXAMPLE.proteinG * KCAL_PER_GRAM.protein +
  EXAMPLE.carbsG * KCAL_PER_GRAM.carbs +
  EXAMPLE.fatG * KCAL_PER_GRAM.fat

const body = computed(() => {
  const v = view.value
  if (v === null) return null
  const male = v.biologicalSex === BiologicalSex.MALE
  const activity = ACTIVITY_OPTIONS.find((option) => option.value === v.activityLevel)
  return {
    weight: decimal.format(v.weightKg),
    height: decimal.format(v.heightCm),
    age: v.ageYears,
    sexLabel: male ? 'un homme' : 'une femme',
    sexTerm: male ? '+ 5' : '− 161',
    activityLabel: activity?.label.toLocaleLowerCase('fr-FR') ?? '',
    multiplier: decimal.format(ACTIVITY_MULTIPLIER[v.activityLevel]),
    rest: number.format(v.basalMetabolicRate),
    need: number.format(v.targetCalories),
    protein: number.format(v.targetMacros.proteinG),
    carbs: number.format(v.targetMacros.carbsG),
    fat: number.format(v.targetMacros.fatG),
    saturatedFat: number.format(v.referenceNutrients.saturatedFatG),
  }
})

const split = {
  protein: percent(BALANCED_MACRO_SPLIT.protein),
  carbs: percent(BALANCED_MACRO_SPLIT.carbs),
  fat: percent(BALANCED_MACRO_SPLIT.fat),
  saturatedFat: percent(SATURATED_FAT_ENERGY_SHARE),
}
</script>

<template>
  <div class="calculations">
    <RouterLink
      class="calculations__back"
      :to="{ name: ROUTE.settings }"
    >
      <span aria-hidden="true">←</span> Réglages
    </RouterLink>

    <h1>Comment sont calculés mes repères ?</h1>
    <p>
      Cette page explique d’où viennent les chiffres de l’application. D’abord ceux des aliments.
      Ensuite ceux de votre journée. Les nombres en gras sont les vôtres.
    </p>

    <BaseCard
      title="1. Ce que contient un aliment"
      subtitle="Les chiffres viennent de bases de données publiques."
    >
      <ul class="calculations__list">
        <li>
          Les aliments courants (pomme, riz, poulet…) viennent de <strong>Ciqual</strong>, le catalogue
          public de l’Anses.
        </li>
        <li>
          Les produits de marque viennent d’<strong>Open Food Facts</strong>, une base libre remplie par
          des bénévoles.
        </li>
        <li>
          Les aliments que vous créez vous-même gardent les chiffres que vous avez écrits.
        </li>
        <li>
          Les chiffres sont donnés <strong>pour 100 g</strong>. Pour un liquide de marque, c’est pour
          100 ml.
        </li>
      </ul>
    </BaseCard>

    <BaseCard
      title="2. Ce que vous mangez"
      subtitle="Le calcul se fait pour la portion que vous avez choisie."
    >
      <ol class="calculations__steps">
        <li>
          <strong>Les portions.</strong> Si vous choisissez « 1 tranche », l’application la convertit en
          grammes. Un signe « ≈ » veut dire que le poids de la tranche est une moyenne.
        </li>
        <li>
          <strong>Le produit en croix.</strong> Chaque chiffre de l’aliment est multiplié par la portion,
          puis divisé par 100.
        </li>
        <li>
          <strong>Les calories.</strong> Elles sont calculées avec les protéines, les glucides et les
          lipides : {{ KCAL_PER_GRAM.protein }} kcal par gramme de protéines,
          {{ KCAL_PER_GRAM.carbs }} kcal par gramme de glucides, {{ KCAL_PER_GRAM.fat }} kcal par gramme de
          lipides.
        </li>
      </ol>
      <p class="calculations__example">
        <strong>Exemple.</strong> Pour 100 g, un aliment contient {{ EXAMPLE.proteinG }} g de protéines,
        {{ EXAMPLE.carbsG }} g de glucides et {{ EXAMPLE.fatG }} g de lipides.
        Cela fait {{ EXAMPLE.proteinG }} × {{ KCAL_PER_GRAM.protein }} + {{ EXAMPLE.carbsG }} ×
        {{ KCAL_PER_GRAM.carbs }} + {{ EXAMPLE.fatG }} × {{ KCAL_PER_GRAM.fat }} =
        <strong>{{ exampleKcalPer100g }} kcal</strong> pour 100 g. Pour {{ EXAMPLE.grams }} g, on
        multiplie par {{ EXAMPLE.grams / 100 }} :
        <strong>{{ exampleKcalPer100g * (EXAMPLE.grams / 100) }} kcal</strong>.
      </p>
      <ul class="calculations__list">
        <li>
          Les fibres, les sucres, les graisses saturées et le sel se calculent de la même façon. Ils ne
          s’ajoutent pas aux calories : ils sont déjà dedans, sauf le sel, qui n’en donne aucune.
        </li>
        <li>
          Quand une base ne donne pas une valeur, l’application compte 0. Pour le sel, Open Food Facts
          donne parfois le sodium : l’application le multiplie par 2,5.
        </li>
        <li>
          Seuls les repas <strong>cochés comme mangés</strong> comptent dans vos jauges. Un repas prévu
          ne compte pas encore.
        </li>
        <li>
          Un repas mangé garde les chiffres du jour où vous l’avez ajouté. Si l’aliment est corrigé
          plus tard, votre journée passée ne change pas.
        </li>
      </ul>
    </BaseCard>

    <BaseCard
      v-if="body"
      title="3. Votre besoin en calories"
      subtitle="C’est l’énergie que votre corps dépense en une journée."
    >
      <ol class="calculations__steps">
        <li>
          <strong>Au repos.</strong> L’application utilise la formule de Mifflin-St Jeor : 10 × poids +
          6,25 × taille − 5 × âge, puis {{ body.sexTerm }} pour {{ body.sexLabel }}.
          <span class="calculations__mine">
            10 × {{ body.weight }} + 6,25 × {{ body.height }} − 5 × {{ body.age }} {{ body.sexTerm }} =
            <strong>{{ body.rest }} kcal</strong>
          </span>
        </li>
        <li>
          <strong>Avec votre activité.</strong> On multiplie par un coefficient : 1,2 si l’on bouge très
          peu, jusqu’à 1,9 pour un métier physique. Le vôtre : « {{ body.activityLabel }} ».
          <span class="calculations__mine">
            {{ body.rest }} × {{ body.multiplier }} = <strong>{{ body.need }} kcal par jour</strong>
          </span>
        </li>
      </ol>
      <p>
        Ce nombre est votre besoin. L’application ne vous demande ni de maigrir, ni de grossir : elle
        vise l’équilibre. C’est une estimation, pas une mesure exacte.
      </p>
    </BaseCard>

    <BaseCard
      v-if="body"
      title="4. Vos protéines, glucides et lipides"
      subtitle="Votre besoin en calories est partagé en trois."
    >
      <p>
        Le partage suit les repères de l’Anses. Il est le même pour tout le monde. Chaque part est
        ensuite transformée en grammes, avec les mêmes kcal par gramme qu’au point 2.
      </p>
      <dl class="calculations__table">
        <div>
          <dt>Protéines</dt>
          <dd>
            {{ split.protein }} de {{ body.need }} kcal ÷ {{ KCAL_PER_GRAM.protein }} =
            <strong>{{ body.protein }} g</strong>
          </dd>
        </div>
        <div>
          <dt>Glucides</dt>
          <dd>
            {{ split.carbs }} de {{ body.need }} kcal ÷ {{ KCAL_PER_GRAM.carbs }} =
            <strong>{{ body.carbs }} g</strong>
          </dd>
        </div>
        <div>
          <dt>Lipides</dt>
          <dd>
            {{ split.fat }} de {{ body.need }} kcal ÷ {{ KCAL_PER_GRAM.fat }} =
            <strong>{{ body.fat }} g</strong>
          </dd>
        </div>
      </dl>
    </BaseCard>

    <BaseCard
      v-if="body"
      title="5. Fibres, sucres, graisses saturées et sel"
      subtitle="Ici, il y a un minimum ou une limite."
    >
      <dl class="calculations__table">
        <div>
          <dt>Fibres</dt>
          <dd>Un <strong>minimum</strong> : au moins 30 g par jour.</dd>
        </div>
        <div>
          <dt>Sucres</dt>
          <dd>Une <strong>limite</strong> : pas plus de 100 g par jour.</dd>
        </div>
        <div>
          <dt>Graisses saturées</dt>
          <dd>
            Une <strong>limite</strong> : {{ split.saturatedFat }} de {{ body.need }} kcal ÷
            {{ KCAL_PER_GRAM.fat }} = <strong>{{ body.saturatedFat }} g</strong>. C’est la seule qui change
            d’une personne à l’autre.
          </dd>
        </div>
        <div>
          <dt>Sel</dt>
          <dd>Une <strong>limite</strong> : moins de 5 g par jour.</dd>
        </div>
      </dl>
      <p>
        Pour les sucres, l’application compte aussi ceux du lait et des fruits. La limite est donc un
        peu sévère : c’est voulu.
      </p>
    </BaseCard>

    <BaseCard
      title="6. La moyenne des 7 derniers jours"
      subtitle="Votre corps ne compte pas jour par jour."
    >
      <ol class="calculations__steps">
        <li>
          L’application prend les {{ RECENT_DAYS }} jours <strong>avant aujourd’hui</strong>.
        </li>
        <li>
          Un jour où vous n’avez marqué <strong>aucun repas mangé</strong> est ignoré. Ce n’est pas un
          jeûne : c’est un jour non renseigné.
        </li>
        <li>
          Pour chaque autre jour, elle compare ce que vous avez mangé au besoin que vous aviez ce
          jour-là. Puis elle fait la moyenne.
        </li>
      </ol>
      <p>
        Cette moyenne <strong>ne change pas</strong> votre objectif du lendemain. Manger plus un jour
        n’oblige pas à manger moins le suivant.
      </p>
    </BaseCard>

    <p class="calculations__caveat">
      Ces repères aident à manger équilibré. Ils ne remplacent pas l’avis d’un médecin ou d’un
      diététicien.
    </p>
  </div>
</template>

<style scoped lang="scss">
.calculations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.calculations h1,
.calculations p {
  margin: 0;
}

.calculations__back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  color: var(--color-text-muted);
  text-decoration: none;

  &:hover {
    color: var(--color-text);
  }
}

.calculations__list,
.calculations__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  padding-left: var(--space-5);
}

.calculations__mine {
  display: block;
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow-wrap: anywhere;
}

.calculations .calculations__example {
  margin-bottom: var(--space-3);
}

.calculations__table {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-3) 0;

  div {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
}

.calculations__caveat {
  color: var(--color-text-muted);
}
</style>
