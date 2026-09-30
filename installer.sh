#!/usr/bin/env bash
# Installe Plausible Community Edition v3.2.1 sur cet ordinateur, en suivant le
# guide « Plausible Analytics — le guide » (étapes 1 à 4).
#
#   bash installer.sh                       # sur cet ordinateur, port 8000
#   bash installer.sh 8001                  # si le port 8000 est déjà pris
#   bash installer.sh stats.mondomaine.fr   # sur un serveur public (HTTPS)
#
# Sous Windows : à lancer dans Git Bash (ou utiliser installer.ps1 dans PowerShell).
# Le dossier d'installation est volontairement hors du dépôt : le fichier .env
# contient une clé secrète qui ne doit pas finir sur GitHub.

set -euo pipefail

ARG="${1:-8000}"
DOMAINE=""
PORT="8000"
if [[ "$ARG" =~ ^[0-9]+$ ]]; then PORT="$ARG"; else DOMAINE="$ARG"; fi
if [ -n "$DOMAINE" ]; then URL="https://$DOMAINE"; else URL="http://localhost:$PORT"; fi
DOSSIER="${PLAUSIBLE_DIR:-$HOME/plausible-ce}"
VERSION="v3.2.1"

# 1. Docker et Docker Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker n'est pas installé."
  echo "  Windows / Mac : installer Docker Desktop — https://docs.docker.com/desktop/"
  echo "  Linux         : https://docs.docker.com/engine/install/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose manque. Il est inclus dans Docker Desktop ; sous Linux :"
  echo "  https://docs.docker.com/compose/install/linux/"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker est installé mais ne tourne pas. Lance Docker Desktop, attends"
  echo "qu'il affiche « Engine running », puis relance ce script."
  exit 1
fi

# 2. Récupérer l'installeur
if [ -d "$DOSSIER/.git" ]; then
  echo "Dossier déjà présent : $DOSSIER (on le garde)."
else
  git clone -b "$VERSION" --single-branch https://github.com/plausible/community-edition "$DOSSIER"
fi
cd "$DOSSIER"

# 3. Fichier de réglages (jamais écrasé : il contient la clé qui protège le compte)
if [ -f .env ]; then
  echo ".env déjà présent, conservé."
else
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 48)"
  else
    SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')"
  fi
  {
    echo "BASE_URL=$URL"
    echo "SECRET_KEY_BASE=$SECRET"
    echo "HTTP_PORT=80"
  } > .env
fi

# 4. Ouvrir le port (80 et 443 sur un serveur : le certificat HTTPS se crée tout seul)
if [ -n "$DOMAINE" ]; then
  cat > compose.override.yml << EOF
services:
  plausible:
    ports:
      - 80:80
      - 443:443
EOF
else
  cat > compose.override.yml << EOF
services:
  plausible:
    ports:
      - $PORT:80
EOF
fi

# 5. Démarrer, puis attendre que la page réponde (jusqu'à 10 minutes)
docker compose up -d
echo "Premier démarrage : environ 800 Mo à télécharger, 2 à 5 minutes…"
for _ in $(seq 1 120); do
  if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
    echo
    echo "Plausible est prêt : $URL"
    echo "Crée ton compte sur cette page, puis ajoute ton site (étape 2 du guide)."
    if [ -n "$DOMAINE" ]; then
      echo
      echo "IMPORTANT : une fois ton compte créé, ajoute DISABLE_REGISTRATION=invite_only"
      echo "dans $DOSSIER/.env puis relance : docker compose up -d"
      echo "Sinon n'importe qui peut s'inscrire sur ton instance."
    fi
    exit 0
  fi
  printf '.'
  sleep 5
done

echo
echo "La page ne répond pas encore. Pour voir où ça en est :"
echo "  cd \"$DOSSIER\" && docker compose logs -f plausible"
exit 1
