# The Quest for the Holy Spoon

Une PWA de nutrition : on planifie ses repas de la semaine, on les coche une fois pris, on suit ses apports.
Le compte est **facultatif** : sans lui, tout tient dans le navigateur ; avec lui, les repas
suivent la personne d'un appareil à l'autre, y compris ceux modifiés hors ligne (foyers en cours
de développement).

Chaque jauge de l'accueil montre aussi la moyenne des sept derniers jours face au repère : les
repères nutritionnels se tiennent en moyenne, pas au jour près. Cette moyenne ne modifie jamais
l'objectif du jour — un déficit ne se « rattrape » pas le lendemain, un excès ne se « paie » pas.
Le bilan des sept derniers jours dit d'où elle vient.

## Démarrer

```bash
npm install
npm run dev:all    # application (Vite) + API (Fastify), dans le même terminal
npm run dev        # application seule — l'usage sans compte fonctionne sans l'API
npm run build      # typecheck + build de production + service worker
npm run test       # Vitest, client et serveur
npm run lint
npm run typecheck  # client (vue-tsc) et serveur (tsc)
```

### Comptes en développement

`npm run dev:all` démarre l'API sur le port 4319 ; Vite lui relaie `/api`, si bien que
l'application et l'API partagent la même origine (pas de CORS, cookie de session sans
configuration). Aucune installation de base n'est nécessaire : l'API utilise **PGlite**
(Postgres compilé en WebAssembly), enregistré dans `server/.data/`. Supprimer ce dossier repart
d'une base vide.

Aucun e-mail ne part en développement : les liens de confirmation et de réinitialisation
s'affichent dans le terminal, à ouvrir dans le navigateur où l'on s'est inscrit.

En production, `NODE_ENV=production`, `APP_URL` (adresse publique de l'application) et
`DATABASE_URL` (Postgres) sont attendus ; `ALLOWED_ORIGINS` et `TRUST_PROXY` sont facultatifs.

### Données de test

En développement, **Réglages → Données de démonstration** crée dix jours de repas autour
d'aujourd'hui, dans le profil courant : un déficit calorique moyen d'environ 7 %, du sel au-dessus
du repère, des fibres en dessous, deux journées chargées, un jour non renseigné, des repas prévus
pour la suite. Les portions sont calculées sur le besoin du profil, si bien que ces moyennes se
retrouvent quel que soit le profil essayé — à une exception près : au-delà de 2 800 kcal environ,
les fibres atteignent le minimum. Le même panneau retire ces repas. Il n'existe pas dans le build
de production.

## Stack

Vue 3 · Vite · Pinia · IndexedDB natif · Zod aux frontières · GSAP · Vitest · TypeScript strict ·
SCSS modulaire à variables CSS.

## Architecture

Le projet suit un découpage en **contextes délimités** (DDD), chacun en quatre couches :

```
src/modules/<contexte>/{domain,application,infrastructure,presentation}
```

Quatre contextes : `account`, `player_profile`, `nutrition_inventory`, `planning`.

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

### Synchronisation

L'application reste **locale d'abord** : IndexedDB est toujours la source des écrans, compte ou
pas. Avec un compte, chaque écriture du profil, d'un repas ou d'un aliment créé à la main dépose,
dans la même transaction, une ligne dans un journal (`outbox`) ; le moteur
(`src/app/sync/SyncEngine.ts`) l'envoie peu après, puis lit ce que les autres appareils ont
changé depuis sa dernière révision. Hors ligne, le journal attend le retour du réseau. La dernière
écriture reçue l'emporte ; une modification locale pas encore envoyée n'est jamais écrasée.

- Premier appareil (ou profil créé avant le compte) : tout ce que l'appareil sait part au serveur.
- Nouvel appareil : le profil du compte est téléchargé et devient le profil courant ; un profil
  local préexistant reste sur l'appareil, hors compte.
- Déconnexion : dernier envoi, puis effacement de la copie locale du compte. Si des modifications
  n'ont pas pu partir, l'application demande confirmation.

### Serveur

`server/` suit les mêmes couches, par contexte :

```
server/src/modules/<contexte>/{domain,application,infrastructure,http}
server/src/shared/        base (Kysely), e-mails, garde d'origine, limiteur de débit
server/src/composition.ts seul endroit où Kysely, argon2 et le mailer sont choisis
```

Le serveur **réutilise le domaine du client** (`src/modules/<contexte>/domain`) : la forme d'une
adresse ou la longueur d'un mot de passe sont écrites une fois, appliquées des deux côtés — et le
serveur fait autorité. Client et serveur partagent aussi le contrat HTTP, en schémas Zod
(`src/contract/`). `server/src/__tests__/architecture.test.ts` vérifie que le domaine et les use
cases du serveur n'importent ni Fastify, ni Kysely, ni argon2, et que le serveur n'emprunte au
client que le noyau, le contrat et le domaine de son propre contexte.

Sécurité des comptes : mots de passe en argon2id ; session en cookie `HttpOnly`,
`SameSite=Lax`, limité à `/api`, dont seule l'empreinte est stockée ; aucune route ne révèle si
une adresse a un compte ; mutations refusées depuis une origine inconnue ; limitation de débit
sur la connexion et l'envoi d'e-mails.

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
