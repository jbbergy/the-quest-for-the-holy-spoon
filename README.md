# The Quest for the Holy Spoon

Une PWA de nutrition gamifiée : on compose ses repas, on suit ses apports, on gagne de l'XP.
Tout tient en local — aucun compte, aucun serveur, aucune donnée qui sorte du navigateur.

## Démarrer

```bash
npm install
npm run dev        # serveur de développement
npm run build      # build de production + service worker
npm run test       # 776 tests
npm run lint
npx vue-tsc --noEmit
```

## Stack

Vue 3 · Vite · Pinia · IndexedDB natif · Zod aux frontières · GSAP · Vitest · TypeScript strict ·
SCSS modulaire à variables CSS.

## Architecture

Le projet suit un découpage en **contextes délimités** (DDD), chacun en quatre couches :

```
src/modules/<contexte>/{domain,application,infrastructure,presentation}
```

Quatre contextes : `player_profile`, `gamification`, `nutrition_inventory`, `planning`.

Trois règles, et elles sont **vérifiées automatiquement** plutôt que recommandées :

1. Le `domain/` est du TypeScript pur et immuable. Aucun import de Vue, Pinia, Zod ou IndexedDB.
2. Un contexte n'accède à un autre que par sa façade `application/index.ts` — jamais son `domain/`.
3. Les erreurs passent par `Result<T, E>`. Pas d'`unwrap()` qui jette.

`eslint.config.js` interdit les imports transgressifs, et `src/core/__tests__/architecture.test.ts`
échoue si la frontière est franchie. `src/app/` est la seule couche autorisée à connaître plusieurs
contextes à la fois ; `src/app/composition.ts` est le seul endroit où une implémentation concrète
est choisie.

La persistance est volontairement **substituable** : les ports (`IPlayerRepository`,
`IFoodRepository`, …) sont déclarés dans le domaine et ne manipulent que des entités. Remplacer
IndexedDB par un backend HTTP reste un changement d'adaptateur.

## Données nutritionnelles

Le catalogue hors-ligne est généré depuis la table de composition de l'ANSES :

```bash
node scripts/build-ciqual.mjs     # → public/data/ciqual.json (3178 aliments)
```

Le JSON produit est versionné : l'application promet de fonctionner hors connexion dès le premier
lancement, ce qu'un catalogue absent d'un clone frais rendrait faux.

Les produits de marque viennent d'Open Food Facts, par code-barres ou par recherche, et rejoignent
le catalogue local au fil des consultations.

## Sources et licences

- **Table Ciqual** — ANSES, sous [Licence Ouverte / Open Licence](https://www.etalab.gouv.fr/licence-ouverte-open-licence)
  (Etalab). <https://ciqual.anses.fr>
- **Open Food Facts** — base contributive sous [ODbL](https://opendatacommons.org/licenses/odbl/),
  les données produit sous DbCL. <https://world.openfoodfacts.org>
- Repères nutritionnels : références ANSES et recommandations PNNS.

Les calories sont estimées par les coefficients d'Atwater (4/4/9 kcal par gramme), le métabolisme de
base par Mifflin-St Jeor.

## Accessibilité

Cible WCAG 2.2 niveau AA : contrastes vérifiés sur les trois thèmes, cibles tactiles de 44 px,
la couleur n'est jamais le seul porteur d'information, et chaque jauge expose un `aria-valuetext`
en toutes lettres.
