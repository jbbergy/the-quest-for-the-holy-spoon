#!/usr/bin/env bash
# Déploie Holy Spoon sur le VPS : build du front, envoi des fichiers, relance de l'API.
set -euo pipefail

SERVER=jibhey.fr
DEST=/srv/apps/holyspoon

cd "$(dirname "$0")/.."

npm run build

rsync -az --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude coverage \
  --exclude server/.data \
  --exclude .claude \
  --exclude .env \
  ./ "$SERVER:$DEST/"

ssh "$SERVER" "cd $DEST && docker compose up -d --build"