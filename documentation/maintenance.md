# Maintenance de la production

Ce document décrit comment Holy Spoon tourne en production, les opérations courantes, et comment
enquêter quand quelque chose ne va pas. Il ne contient **aucun secret** : les mots de passe et clés
vivent dans le `.env` du serveur et dans le gestionnaire de mots de passe.

- [Vue d'ensemble](#vue-densemble)
- [Opérations courantes](#opérations-courantes)
- [Échéances à surveiller](#échéances-à-surveiller)
- [Enquêter : la méthode](#enquêter--la-méthode)
- [Problèmes connus et solutions](#problèmes-connus-et-solutions)
- [Reconstruire le serveur](#reconstruire-le-serveur)

---

## Vue d'ensemble

```
Navigateur ──HTTPS──► Caddy (ports 80/443, sur l'hôte)
                        ├─ holyspoon.jibhey.fr
                        │    ├─ /api/*  ──► 127.0.0.1:4319 ──► conteneur holyspoon-api ──réseau infra──► conteneur postgres
                        │    └─ le reste ──► /srv/apps/holyspoon/dist (front statique)
                        ├─ jibhey.fr     ──► /srv/sites/jibhey.fr (page de citations)
                        └─ www.jibhey.fr ──► redirection 301 vers jibhey.fr

API ──SMTP (587, TLS)──► Brevo ──► boîtes de réception
```

| Élément | Où | Rôle |
|---|---|---|
| VPS | OVH, Ubuntu 26.04, `152.228.170.12` / `2001:41d0:305:2100::1:72ef` | |
| Accès | `ssh jibhey.fr` (alias de `~/.ssh/config` → `ubuntu@152.228.170.12`) | clés SSH uniquement |
| DNS | OVH, zone `jibhey.fr` | `*`, `@`, `www` en A/AAAA vers le VPS ; MX/SPF de Zimbra ; DKIM/DMARC de Brevo |
| Pare-feu | `ufw` | entrée : 22, 80, 443 (TCP) et 443 (UDP) uniquement |
| fail2ban | service `fail2ban` | bannit les IP qui échouent en SSH |
| Caddy | `/etc/caddy/Caddyfile` + `/etc/caddy/sites/*.caddy` | HTTPS automatique, en-têtes de sécurité (snippet `security`), CSP par site |
| Postgres 18 | `/srv/postgres` (compose, `.env`, `data/`) | une base + un utilisateur par application ; aucun port publié |
| API Holy Spoon | `/srv/apps/holyspoon` (copie du repo, `.env`, `dist/`) | conteneur `holyspoon-api`, port `127.0.0.1:4319` |
| Réseau Docker | `infra` | relie les API à Postgres (`postgres:5432`) |
| Sauvegardes | `/srv/backups` (`backup.sh`, `postgres/`, `backup.log`) | tous les jours à 3 h 15 via `/etc/cron.d/pg-backup`, 14 jours gardés |
| E-mails | Brevo, expéditeur `Holy Spoon <holyspoon@jibhey.fr>` | clé SMTP `holyspoon-vps`, limitée à l'IP du VPS |

Le `.env` de l'API (`/srv/apps/holyspoon/.env`, droits `600`) contient : `APP_URL`,
`DATABASE_URL`, `TRUST_PROXY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
Pour en lister les noms **sans afficher les valeurs** :

```bash
cut -d= -f1 /srv/apps/holyspoon/.env
```

---

## Opérations courantes

### Déployer une nouvelle version

Depuis le Mac, à la racine du repo :

```bash
./scripts/deploy.sh
```

Le script lance `npm run build` (typecheck compris), envoie le repo avec `rsync` vers
`/srv/apps/holyspoon` (sans `.git`, `node_modules`, `.env`…), puis reconstruit et relance l'API
avec `docker compose up -d --build`. Les migrations de base s'appliquent au démarrage de l'API.

La page `jibhey.fr` se déploie séparément : `~/Codes/jibhey.fr/deploy.sh`.

### Lire les journaux

```bash
# API (les erreurs 5xx y sont journalisées avec leur cause)
docker compose -f /srv/apps/holyspoon/docker-compose.yml logs api --tail 50
docker compose -f /srv/apps/holyspoon/docker-compose.yml logs api -f      # en continu, Ctrl+C pour sortir

# Postgres
docker compose -f /srv/postgres/docker-compose.yml logs --tail 50

# Caddy (certificats, erreurs de proxy)
sudo journalctl -u caddy --since "1 hour ago" --no-pager

# Sauvegardes
cat /srv/backups/backup.log
```

### Redémarrer

```bash
# L'API seule
cd /srv/apps/holyspoon && docker compose restart api

# L'API en relisant le .env (après modification d'une variable)
cd /srv/apps/holyspoon && docker compose up -d --force-recreate

# Postgres (coupe l'API quelques secondes)
cd /srv/postgres && docker compose restart

# Caddy : toujours valider avant de recharger
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

`docker compose restart` **ne relit pas** le `.env` : après avoir changé une variable, il faut
`up -d --force-recreate`.

### Modifier la configuration de Caddy

Toujours en trois temps : modifier le fichier, valider, recharger. Oublier le rechargement est la
cause la plus fréquente d'un « ça ne marche pas » après une modification.

```bash
sudo nano /etc/caddy/sites/holyspoon.caddy
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

### Mettre à jour le système

```bash
sudo apt update && sudo apt full-upgrade -y
ls /var/run/reboot-required 2>/dev/null && echo "Redémarrage nécessaire"
sudo reboot   # si nécessaire ; tout redémarre seul (voir « Après un redémarrage »)
```

Les correctifs de sécurité s'installent déjà automatiquement (`unattended-upgrades`), mais pas
toujours le noyau, qui demande un redémarrage.

### Mettre à jour les images Docker

```bash
# Postgres : versions mineures de la 18 (18.6 → 18.7…), sans risque pour les données
cd /srv/postgres && docker compose pull && docker compose up -d

# Image de base de l'API (node:24-slim) : correctifs de sécurité de Debian et de Node
cd /srv/apps/holyspoon && docker compose build --pull && docker compose up -d
```

Le déploiement habituel réutilise l'image `node:24-slim` en cache : le `--pull` ci-dessus est à
faire de temps en temps, par exemple une fois par mois.

⚠️ **Ne jamais changer `postgres:18` en `postgres:19` dans le compose** : une version majeure
ne lit pas les données d'une autre. Voir [Changer de version majeure de Postgres](#changer-de-version-majeure-de-postgres).

### Après un redémarrage du serveur

Tout repart seul : Caddy, Docker et fail2ban sont des services activés, et les conteneurs ont
`restart: unless-stopped`. Pour vérifier :

```bash
systemctl is-active caddy docker fail2ban
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -s https://holyspoon.jibhey.fr/api/health     # depuis n'importe où : {"status":"ok"}
```

### Restaurer une sauvegarde

**Tester une sauvegarde sans toucher à la vraie base** (à refaire de temps en temps) :

```bash
docker exec postgres createdb -U postgres restore_test
docker exec -i postgres pg_restore -U postgres -d restore_test --no-owner < "$(ls -t /srv/backups/postgres/holyspoon_*.dump | head -1)"
docker exec postgres psql -U postgres -d restore_test -c '\dt'
docker exec postgres dropdb -U postgres restore_test
```

**Remplacer la base de production par une sauvegarde** (perte de tout ce qui a été écrit depuis) :

```bash
# 1. Choisir le fichier
ls -lt /srv/backups/postgres/

# 2. Sauvegarder l'état actuel, au cas où
/srv/backups/backup.sh

# 3. Arrêter l'API pour qu'elle n'écrive plus
cd /srv/apps/holyspoon && docker compose stop api

# 4. Recréer une base vide et la restaurer (remplacer le nom du fichier)
docker exec postgres dropdb -U postgres holyspoon
docker exec postgres createdb -U postgres -O holyspoon holyspoon
docker exec postgres psql -U postgres -c "REVOKE ALL ON DATABASE holyspoon FROM PUBLIC;"
docker exec -i postgres pg_restore -U postgres -d holyspoon < /srv/backups/postgres/holyspoon_AAAA-MM-JJ_HHMM.dump

# 5. Relancer l'API
docker compose start api
```

### Renouveler la clé SMTP Brevo

1. Brevo → Paramètres → SMTP et API → Générer une nouvelle clé SMTP (variante Standard).
2. La ranger dans le gestionnaire de mots de passe.
3. Remplacer la valeur dans le `.env`, sans que la clé passe par l'historique du shell :

   ```bash
   cd /srv/apps/holyspoon
   read -rs SMTP_PASSWORD        # coller la clé, Entrée
   echo ${#SMTP_PASSWORD}        # longueur attendue : 90
   sed -i "s|^SMTP_PASSWORD=.*|SMTP_PASSWORD=$SMTP_PASSWORD|" .env
   unset SMTP_PASSWORD
   docker compose up -d --force-recreate
   ```

4. Tester avec « Mot de passe oublié » sur le site, puis supprimer l'ancienne clé dans Brevo.

### Ajouter une nouvelle application

1. Base : `CREATE ROLE <app> LOGIN PASSWORD '…'`, `CREATE DATABASE <app> OWNER <app>`,
   `REVOKE ALL ON DATABASE <app> FROM PUBLIC` (même méthode que pour `holyspoon`, mot de passe
   généré par `openssl rand -hex 32`).
2. Dossier `/srv/apps/<app>` avec son `.env` (droits `600`).
3. Dans son repo : `Dockerfile`, `.dockerignore`, `docker-compose.yml` (réseau `infra`, port publié
   **uniquement** sur `127.0.0.1`, sur un port libre), `scripts/deploy.sh`.
4. `/etc/caddy/sites/<app>.caddy` avec `import security` et sa propre CSP, puis valider et recharger.

Le DNS n'a rien à faire (entrée `*`), et les sauvegardes incluent automatiquement la nouvelle base.

---

## Échéances à surveiller

| Quand | Quoi | Conséquence si oublié |
|---|---|---|
| **29 septembre 2027** | Expiration de la clé SMTP Brevo `holyspoon-vps` | plus aucun e-mail (inscription, mot de passe oublié, invitations) |
| **90 jours sans aucun envoi** | La clé SMTP Brevo expire aussi par inactivité | idem |
| **Septembre 2029** | Renouvellement du domaine `jibhey.fr` chez OVH | tout le site et les e-mails tombent |
| Automatique (~60 jours) | Certificats HTTPS, renouvelés par Caddy | Let's Encrypt prévient `jibhey@proton.me` en cas d'échec |

---

## Enquêter : la méthode

Remonter le chemin d'une requête, de l'extérieur vers l'intérieur, et s'arrêter au premier
maillon qui casse :

```
1. DNS        dig +short holyspoon.jibhey.fr              → 152.228.170.12 ?
2. Réseau     curl -sS -o /dev/null -w "%{http_code}\n" https://holyspoon.jibhey.fr/
3. Caddy      systemctl is-active caddy ; sudo ss -tlnp | grep -E ':(80|443) '
4. API        curl -s http://127.0.0.1:4319/api/health     (sur le serveur) → {"status":"ok"} ?
5. Conteneur  docker compose -f /srv/apps/holyspoon/docker-compose.yml ps / logs api
6. Base       docker compose -f /srv/postgres/docker-compose.yml ps   → (healthy) ?
```

Lire un code de réponse ou un message d'erreur de `curl` :

| Symptôme | Maillon en cause |
|---|---|
| `Could not resolve host` | DNS |
| `Connection refused` | rien n'écoute sur le port : Caddy arrêté ou sans configuration pour ce nom |
| `Connection timed out` | pare-feu, ou serveur injoignable (OVH, réseau) |
| Erreur de certificat | Caddy n'a pas obtenu le certificat (voir ses journaux) |
| `502 Bad Gateway` | Caddy fonctionne, mais l'API ne répond pas sur `127.0.0.1:4319` |
| `500` | l'API a planté sur cette requête : la cause est dans `logs api` |
| `404` sur `/api/…` | route inexistante, ou préfixe `/api` perdu |

Quelques réflexes :

- `curl -s` masque aussi les erreurs : utiliser `curl -sS`, ou `curl -v` pour tout voir.
- Dans le navigateur, la console et l'onglet Réseau des outils de développement disent quelle
  requête échoue et pourquoi (CORS, CSP, code HTTP).
- En cas de doute sur un cache, recharger sans cache (Cmd+Maj+R).

---

## Problèmes connus et solutions

### Le site ne répond plus du tout

1. `dig +short holyspoon.jibhey.fr` : si l'IP n'est plus `152.228.170.12`, la zone DNS a changé
   (ou le domaine a expiré — voir les échéances).
2. `ssh jibhey.fr` : si le serveur ne répond pas non plus, regarder l'état du VPS dans l'espace
   client OVH (panne, incident réseau, VPS arrêté). La **console KVM** d'OVH permet d'y accéder
   sans SSH.
3. Sur le serveur : `systemctl status caddy`. S'il est arrêté : `sudo systemctl start caddy`, puis
   `sudo journalctl -u caddy -n 50 --no-pager` pour comprendre pourquoi.
4. `sudo ufw status` : les ports 80 et 443 doivent être autorisés.

### « Connection refused » juste après une modification de Caddy

La configuration a été modifiée mais pas rechargée, ou le fichier du site n'est pas importé.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
ls /etc/caddy/sites/          # le fichier doit finir par .caddy
```

### Erreur de certificat HTTPS

Caddy n'a pas obtenu ou pas renouvelé le certificat.

```bash
sudo journalctl -u caddy --since "1 day ago" --no-pager | grep -iE "error|acme|certificate"
```

Causes habituelles : le DNS du nom ne pointe pas vers le VPS, le port 80 est fermé (Let's Encrypt
vérifie par là), ou la limite de Let's Encrypt est atteinte après trop d'essais ratés (attendre
une heure après avoir corrigé la cause).

### 502 Bad Gateway sur l'application

L'API ne répond pas. Sur le serveur :

```bash
cd /srv/apps/holyspoon
docker compose ps           # le conteneur tourne-t-il ? redémarre-t-il en boucle ?
docker compose logs api --tail 50
```

Si le conteneur est arrêté sans raison apparente : `docker compose up -d`.

### L'API refuse de démarrer

Le message est au début de `docker compose logs api` :

| Message | Cause | Solution |
|---|---|---|
| `APP_URL est obligatoire en production.` | variable absente du `.env` | l'ajouter, puis `up -d --force-recreate` |
| `DATABASE_URL est obligatoire en production.` | idem | idem |
| `SMTP_HOST est obligatoire en production.` | idem | idem |
| `SMTP_HOST est défini : SMTP_USER, SMTP_PASSWORD et MAIL_FROM…` | configuration SMTP incomplète | compléter le `.env` |
| `getaddrinfo ENOTFOUND postgres` | l'API ne trouve pas Postgres sur le réseau `infra` | `docker ps` : Postgres tourne-t-il ? `docker network inspect infra` : les deux conteneurs y sont-ils ? |
| `ECONNREFUSED` vers le port 5432 | Postgres démarre ou est arrêté | `cd /srv/postgres && docker compose up -d`, attendre `(healthy)` |
| `password authentication failed for user "holyspoon"` | mot de passe du `.env` différent de celui de la base | redéfinir le mot de passe (voir ci-dessous) |

Redéfinir le mot de passe de l'utilisateur `holyspoon` et le `.env` en même temps :

```bash
cd /srv/apps/holyspoon
PASS=$(openssl rand -hex 32)
docker exec postgres psql -U postgres -c "ALTER ROLE holyspoon PASSWORD '$PASS';"
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://holyspoon:$PASS@postgres:5432/holyspoon|" .env
unset PASS
docker compose up -d --force-recreate
```

### Les e-mails n'arrivent pas

1. **L'envoi a-t-il échoué ?** Une erreur SMTP fait échouer la requête (l'utilisateur voit une
   erreur) et apparaît dans `docker compose logs api`, avec le message du serveur de Brevo.
2. **Lire le message d'erreur** :
   - authentification refusée (`535`, `Authentication failed`) : clé SMTP expirée (1 an, ou
     90 jours sans envoi) ou révoquée → vérifier son statut dans Brevo → SMTP et API, et
     [la renouveler](#renouveler-la-clé-smtp-brevo) ;
   - refus lié à l'adresse IP : la clé est limitée à `152.228.170.12` ; si le VPS a changé
     d'IP, mettre à jour la liste dans Brevo → Paramètres → Sécurité ;
   - délai dépassé (`ETIMEDOUT`, `ECONNECTION`) : Brevo injoignable depuis le VPS
     (`nc -vz smtp-relay.brevo.com 587` sur le serveur).
3. **Pas d'erreur, mais rien dans la boîte** : l'envoi est parti. Regarder les spams, puis les
   journaux d'envoi dans Brevo (statut délivré / rejeté / bloqué). Le quota gratuit est de
   300 e-mails par jour.
4. **Arrivé en spam** : vérifier que l'authentification du domaine est toujours en place.

   ```bash
   dig +short CNAME brevo1._domainkey.jibhey.fr   # b1.jibhey-fr.dkim.brevo.com.
   dig +short TXT _dmarc.jibhey.fr                # v=DMARC1; p=none; …
   dig +short TXT jibhey.fr                       # un seul v=spf1…, et le brevo-code
   ```

   Dans l'e-mail reçu, les en-têtes (« Afficher l'original » / « Voir les en-têtes ») doivent
   indiquer `dkim=pass` et `dmarc=pass`.
5. **« Trop de tentatives, réessayez plus tard. »** (HTTP 429) côté utilisateur : c'est la
   limitation de débit de l'API sur la connexion et l'envoi d'e-mails, voulue. Attendre avant de
   redemander.

⚠️ Dans la zone DNS, il ne doit exister **qu'un seul** enregistrement SPF (`v=spf1…`) : en ajouter
un second invalide les deux.

### La recherche d'aliments échoue

La console du navigateur affiche « Blocage d'une requête multiorigine (CORS) … Code d'état :
(null) » vers `world.openfoodfacts.org`. Ce n'est ni le serveur ni la CSP : la recherche d'Open
Food Facts répond par intermittence `503 Page temporarily unavailable`, sans l'en-tête CORS, et
le navigateur le présente comme une erreur CORS. Vérifier depuis n'importe où :

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://world.openfoodfacts.org/cgi/search.pl?search_terms=miel&search_simple=1&action=process&json=1&page_size=1"
```

Une réponse `503` confirme une indisponibilité chez eux : réessayer plus tard.

### Une fonctionnalité est bloquée par la CSP

La console affiche un message commençant par **« Content-Security-Policy »**, qui nomme la
ressource bloquée et la règle en cause. La CSP de Holy Spoon est dans
`/etc/caddy/sites/holyspoon.caddy` :

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://world.openfoodfacts.org;
img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'
```

`'wasm-unsafe-eval'` sert au scanner de codes-barres : sur Firefox et Safari, qui n'ont pas
`BarcodeDetector`, la lecture passe par ZXing compilé en WebAssembly (`zxing_reader-*.wasm`,
servi par l'application). Sans cette règle, le scanner s'ouvre mais ne lit jamais rien, et la
console signale `WebAssembly.instantiate` bloqué par la CSP. Chrome sur Android n'en a pas besoin.

- Appel vers une nouvelle API externe → l'ajouter à `connect-src`.
- Images externes → les ajouter à `img-src`.
- La caméra est autorisée à la demande (`Permissions-Policy: camera=(self)`, dans le snippet
  `security` du `Caddyfile`) ; micro et géolocalisation sont bloqués.

⚠️ Le service worker garde `index.html` **avec ses en-têtes**, CSP comprise : une CSP modifiée
dans Caddy n'atteint les téléphones où l'application est installée qu'au déploiement suivant
(nouvel `index.html`, mise à jour acceptée). Changer la CSP **puis** redéployer.

Pour tester une nouvelle politique sans rien casser, la passer temporairement en
`Content-Security-Policy-Report-Only` : le navigateur signale sans bloquer.

### La PWA ne propose pas la nouvelle version

- `curl -sI https://holyspoon.jibhey.fr/sw.js | grep -i cache-control` doit afficher `no-cache`.
  Sinon, la règle de cache de `holyspoon.caddy` a été perdue.
- La mise à jour est **proposée**, pas imposée (`registerType: 'prompt'`) : l'utilisateur doit
  l'accepter. Fermer tous les onglets de l'application force aussi le passage.
- Vérifier que le déploiement a bien envoyé le nouveau build :
  `ls -l /srv/apps/holyspoon/dist/index.html` (date).

### Le déploiement échoue

`deploy.sh` s'arrête à la première erreur ; l'étape en cause est la dernière affichée.

| Étape | Causes fréquentes |
|---|---|
| `npm run build` | erreur de types ou de build : à corriger en local, rien n'est parti |
| `rsync` | SSH indisponible, ou dossier `/srv/apps/holyspoon` n'appartenant plus à `ubuntu` (`sudo chown -R ubuntu:ubuntu /srv/apps`) |
| `docker compose up -d --build` | `npm ci` en échec (`package-lock.json` pas à jour : lancer `npm install` en local et committer) ; disque plein |

Si le nouveau conteneur démarre puis s'arrête, voir [L'API refuse de démarrer](#lapi-refuse-de-démarrer).
Pour revenir à la version précédente : `git checkout <commit>` en local, puis `./scripts/deploy.sh`
(les migrations déjà appliquées ne sont pas annulées).

### Les sauvegardes ne se font plus

```bash
tail -5 /srv/backups/backup.log                     # une ligne « sauvegarde terminée » par nuit ?
ls -lt /srv/backups/postgres/ | head                 # fichier du jour présent ?
sudo journalctl -u cron --since "2 days ago" --no-pager | grep backup
/srv/backups/backup.sh                               # lancer à la main pour voir l'erreur
```

Causes habituelles : Postgres arrêté (`docker exec` échoue), disque plein, fichier
`/etc/cron.d/pg-backup` modifié (il doit appartenir à `root`, et son nom ne doit contenir ni point
ni extension). Un fichier `.tmp` qui traîne dans `postgres/` signale une sauvegarde interrompue.

Rappel : les sauvegardes sont **sur le même disque** que la base. Elles protègent d'une erreur de
manipulation, pas de la perte du VPS. Les copier ailleurs dès que les données deviennent
importantes.

### Le disque est plein

```bash
df -h /                                   # espace libre
sudo du -sh /srv/* /var/lib/docker /var/log 2>/dev/null
docker system df                          # images, conteneurs, cache de build
docker image prune -f                     # supprime les images qui ne servent plus
docker builder prune -f                   # vide le cache de construction
sudo journalctl --vacuum-size=200M        # réduit les journaux système
```

Chaque déploiement laisse une ancienne image `holyspoon-api` sans nom : `docker image prune -f`
les supprime sans risque.

### Impossible de se connecter en SSH

- `Permission denied (publickey)` : l'ordinateur n'a pas de clé autorisée. Depuis un ordinateur
  qui a accès, ajouter sa clé publique à `~/.ssh/authorized_keys` (avec `>>`, jamais `>`).
- La connexion ne répond plus après plusieurs essais ratés : l'IP est peut-être bannie par
  fail2ban. Depuis un autre réseau (partage de connexion du téléphone) ou la console KVM :

  ```bash
  sudo fail2ban-client status sshd
  sudo fail2ban-client set sshd unbanip <IP>
  ```

- Plus aucun accès : console KVM dans l'espace client OVH, puis vérifier `sudo ufw status`
  (le port 22 / OpenSSH doit être autorisé) et `~/.ssh/authorized_keys`.

### Le serveur est lent ou manque de mémoire

```bash
free -h                   # RAM et swap (2 Go de swap)
docker stats --no-stream  # consommation par conteneur
uptime                    # charge moyenne (2 vCPU)
```

Un swap très utilisé en permanence signale un manque de RAM : identifier le conteneur en cause avec
`docker stats`, ou envisager un VPS plus gros.

### Changer de version majeure de Postgres

Une version majeure (18 → 19) ne lit pas les fichiers d'une autre. Procédure : sauvegarder
(`/srv/backups/backup.sh`), arrêter les API, arrêter Postgres, déplacer `/srv/postgres/data`
de côté, passer l'image à la nouvelle version, démarrer (base vide), restaurer
`globals_*.sql` avec `psql`, puis chaque base avec `pg_restore`, relancer les API. Garder l'ancien
dossier `data` jusqu'à ce que tout soit vérifié.

---

## Reconstruire le serveur

Si le VPS est perdu, les étapes, dans l'ordre :

1. **Socle** : `apt full-upgrade`, fuseau `Europe/Paris`, swap de 2 Go dans `/etc/fstab`, `ufw`
   (OpenSSH, 80/tcp, 443/tcp, 443/udp — **SSH autorisé avant `ufw enable`**), `fail2ban`.
2. **Docker** depuis le dépôt officiel (`docker-ce`, `docker-compose-plugin`…), utilisateur
   `ubuntu` dans le groupe `docker`.
3. **Caddy** depuis son dépôt, `Caddyfile` avec l'e-mail ACME, le snippet `security` et
   `import /etc/caddy/sites/*.caddy`.
4. **Postgres** : `docker network create infra`, puis `/srv/postgres` (compose `postgres:18`,
   volume `./data:/var/lib/postgresql`, aucun port, `.env` avec `POSTGRES_PASSWORD`).
5. **Données** : restaurer `globals_*.sql` (utilisateurs) puis `holyspoon_*.dump` — à condition
   d'en avoir une copie hors du serveur perdu.
6. **Application** : `/srv/apps/holyspoon/.env` (8 variables), `./scripts/deploy.sh`, puis
   `/etc/caddy/sites/holyspoon.caddy`.
7. **Sauvegardes** : `/srv/backups/backup.sh` et `/etc/cron.d/pg-backup`.
8. **Si l'IP a changé** : zone DNS OVH (`*`, `@`, `www` en A et AAAA), `~/.ssh/config`, et la
   liste des IP autorisées de la clé SMTP dans Brevo.
