# Analytic : ton service de statistiques de sites web

Ces scripts suivent le guide « Plausible Analytics — le guide » : ils installent
Plausible Community Edition v3.2.1 dans `~/plausible-ce`, hors du dépôt, parce
que le fichier `.env` contient une clé secrète. Une même instance peut suivre
autant de sites que tu veux.

## Deux façons de l'installer

| | Sur ton ordinateur | Sur un serveur |
| --- | --- | --- |
| À quoi ça sert | Essayer l'outil, préparer tes démos | Mesurer les sites de tes clients |
| Commande | `installer.ps1` (Windows) ou `bash installer.sh` | `bash installer.sh stats.ton-domaine.fr` |
| Adresse | http://localhost:8000 | https://stats.ton-domaine.fr |

**Pour des clients, il faut le serveur.** Le script de suivi s'exécute dans le
navigateur de chaque visiteur et envoie la visite à l'adresse de ton instance :
avec `localhost`, il l'enverrait vers l'ordinateur du visiteur, jamais vers le
tien. Il te faut un VPS Linux (2 Go de mémoire minimum, 4 Go conseillés), avec
les ports 80 et 443 ouverts, et un sous-domaine qui pointe vers son adresse IP.
Un hébergement mutualisé classique ne fait pas tourner Docker.

### Sur ton ordinateur (Windows)

Docker Desktop installé et lancé (« Engine running »). Git n'est pas nécessaire.

1. Sur GitHub, ouvre `installer.ps1` dans ce dépôt et clique sur l'icône
   **Download raw file** (flèche vers le bas, en haut à droite du fichier).
2. Dans PowerShell :
   ```powershell
   powershell -ExecutionPolicy Bypass -File "$HOME\Downloads\installer.ps1"
   ```
3. Le script ouvre http://localhost:8000 quand Plausible est prêt.

Le port 8000 est déjà pris ? Ajoute `-Port 8001`.

### Sur un serveur

1. Chez ton gestionnaire DNS : un enregistrement `A` de `stats.ton-domaine.fr`
   vers l'IP du serveur.
2. Sur le serveur : installer Docker (https://docs.docker.com/engine/install/),
   cloner ce dépôt (`git clone …/analytic`), puis :
   ```bash
   bash installer.sh stats.ton-domaine.fr
   ```
3. Ouvre https://stats.ton-domaine.fr et crée ton compte.
4. **Tout de suite après**, ferme les inscriptions : ajoute
   `DISABLE_REGISTRATION=invite_only` dans `~/plausible-ce/.env`, puis
   `docker compose up -d`. Sinon n'importe qui peut s'inscrire sur ton instance.
   Avec `invite_only`, tes clients ne peuvent entrer que si tu les invites.

Les scripts peuvent être relancés sans risque : ils gardent le dossier et le
`.env` existants.

## Ajouter un client

1. Tableau de bord → **Add website** → domaine du client (sans `https://` ni
   `www`) et son fuseau horaire.
2. Envoie-lui le bout de code de l'écran suivant, à coller dans le `<head>` de
   son site (WordPress : plugin officiel ; Shopify : `theme.liquid` ; Wix,
   Webflow, Squarespace : « Code personnalisé »).
3. Pour qu'il voie ses chiffres : **Site settings → People → Invite** (accès en
   lecture), ou **Visibility → Shared links** pour un lien sans compte.
4. S'il vend en ligne : **Site settings → Goals** pour suivre panier, paiement et
   achat (étape 4 du guide).

## Avant de vendre le service

- **Seuls les sites qui ont installé ton script sont mesurés.** C'est le client
  qui le colle chez lui, et c'est à lui que tu vends ses propres chiffres.
- **RGPD : tu deviens sous-traitant de chaque client.** Il faut un contrat de
  sous-traitance (article 28) : ce que tu collectes, où c'est hébergé (préfère
  un serveur dans l'UE), combien de temps tu le gardes. Le client doit
  mentionner la mesure d'audience dans sa politique de confidentialité.
  Plausible ne pose pas de cookie ; en France, la CNIL peut alors dispenser la
  mesure d'audience de consentement, sous conditions. Fais relire ton contrat.
- **Ne revends pas les données d'un client à quelqu'un d'autre** (concurrent,
  courtier en données) sans son accord écrit : ce n'est ni dans le contrat de
  sous-traitance, ni dans ce que ses visiteurs ont accepté.
- **Licence AGPL :** tu peux faire payer le service. Si tu modifies le code de
  Plausible, tu dois mettre tes modifications à disposition de tes clients.
  « Plausible » est une marque : vends le service sous ton propre nom.

## Commandes utiles (dans `~/plausible-ce`)

| Pour… | Commande |
| --- | --- |
| Arrêter sans rien perdre | `docker compose stop` |
| Redémarrer | `docker compose start` |
| Voir ce qui se passe | `docker compose logs -f plausible` |
| Mettre à jour | `docker compose pull` puis `docker compose up -d` |
| Tout effacer (comptes et statistiques) | `docker compose down -v` |

Les statistiques vivent dans les volumes Docker : sur un serveur de clients,
sauvegarde-les régulièrement (arrêt avec `docker compose stop` avant copie).

## Trouver des clients

Un modèle d'e-mail de prospection (premier contact et relance) et les règles à
respecter sont dans [docs/email-prospection.md](docs/email-prospection.md).
