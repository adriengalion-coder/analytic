# Installe Plausible Community Edition v3.2.1 sur cet ordinateur (Windows,
# PowerShell), en suivant le guide « Plausible Analytics — le guide ».
#
#   powershell -ExecutionPolicy Bypass -File installer.ps1
#   powershell -ExecutionPolicy Bypass -File installer.ps1 -Port 8001
#   (pour un serveur public, lancer installer.sh sur le serveur Linux)
#
# Le dossier d'installation (%USERPROFILE%\plausible-ce) est volontairement hors
# du dépôt : le fichier .env contient une clé secrète qui ne doit pas aller sur GitHub.

param(
  [int]$Port = 8000,
  [string]$Dossier = (Join-Path $HOME 'plausible-ce')
)

$ErrorActionPreference = 'Stop'
$Version = 'v3.2.1'

# 1. Docker et Docker Compose
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker n'est pas installé : installer Docker Desktop — https://docs.docker.com/desktop/setup/install/windows-install/"
  exit 1
}
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker Compose manque : mettre Docker Desktop à jour."; exit 1 }
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker ne tourne pas. Lance Docker Desktop, attends « Engine running », puis relance ce script."
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git n'est pas installé : https://git-scm.com/download/win"
  exit 1
}

# 2. Récupérer l'installeur
if (Test-Path (Join-Path $Dossier '.git')) {
  Write-Host "Dossier déjà présent : $Dossier (on le garde)."
} else {
  git clone -b $Version --single-branch https://github.com/plausible/community-edition $Dossier
  if ($LASTEXITCODE -ne 0) { exit 1 }
}
Set-Location $Dossier

# Fichiers écrits en UTF-8 sans BOM et fins de ligne Unix, comme les attend Docker
function Ecrire($Chemin, $Lignes) {
  $texte = ($Lignes -join "`n") + "`n"
  [IO.File]::WriteAllText((Join-Path $Dossier $Chemin), $texte, (New-Object Text.UTF8Encoding $false))
}

# 3. Fichier de réglages (jamais écrasé : il contient la clé qui protège le compte)
if (Test-Path '.env') {
  Write-Host ".env déjà présent, conservé."
} else {
  $octets = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
  $secret = [Convert]::ToBase64String($octets)
  Ecrire '.env' @(
    "BASE_URL=http://localhost:$Port",
    "SECRET_KEY_BASE=$secret",
    "HTTP_PORT=80"
  )
}

# 4. Ouvrir le port
Ecrire 'compose.override.yml' @(
  'services:',
  '  plausible:',
  '    ports:',
  "      - ${Port}:80"
)

# 5. Démarrer, puis attendre que la page réponde (jusqu'à 10 minutes)
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Premier démarrage : environ 800 Mo à télécharger, 2 à 5 minutes…"
for ($i = 0; $i -lt 120; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host ""
    Write-Host "Plausible est prêt : http://localhost:$Port"
    Write-Host "Crée ton compte sur cette page, puis ajoute ton site (étape 2 du guide)."
    Start-Process "http://localhost:$Port"
    exit 0
  } catch {
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 5
  }
}
Write-Host ""
Write-Host "La page ne répond pas encore. Pour voir où ça en est :"
Write-Host "  cd `"$Dossier`"; docker compose logs -f plausible"
exit 1
