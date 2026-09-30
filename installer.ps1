# Installe Plausible Community Edition v3.2.1 sur cet ordinateur (Windows,
# PowerShell), en suivant le guide « Plausible Analytics — le guide ».
#
#   powershell -ExecutionPolicy Bypass -File installer.ps1
#   powershell -ExecutionPolicy Bypass -File installer.ps1 -Port 8001
#   (pour un serveur public, lancer installer.sh sur le serveur Linux)
#
# Git n'est pas obligatoire : sans lui, l'installeur est téléchargé en archive.
# Le script peut aussi être collé tel quel dans une fenêtre PowerShell, entre
# « & { » et « } » : il utilise return plutôt que exit pour ne pas la fermer.
#
# Le dossier d'installation (%USERPROFILE%\plausible-ce) est volontairement hors
# du dépôt : le fichier .env contient une clé secrète qui ne doit pas aller sur GitHub.

param(
  [int]$Port = 8000,
  [string]$Dossier = (Join-Path $HOME 'plausible-ce')
)

$Version = '3.2.1'

# 1. Docker et Docker Compose
# (sorties redirigées vers Out-Null : sous Windows PowerShell 5, rediriger le flux
# d'erreur d'un programme externe avec « Stop » arrêterait le script)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker n'est pas installé : installer Docker Desktop — https://docs.docker.com/desktop/setup/install/windows-install/"
  return
}
docker compose version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker Compose manque : mettre Docker Desktop à jour."; return }
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker ne tourne pas. Lance Docker Desktop, attends « Engine running », puis relance."
  return
}

# 2. Récupérer l'installeur (avec Git s'il est là, sinon en archive)
if (Test-Path (Join-Path $Dossier 'compose.yml')) {
  Write-Host "Dossier déjà présent : $Dossier (on le garde)."
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
  git clone -b "v$Version" --single-branch https://github.com/plausible/community-edition $Dossier
  if ($LASTEXITCODE -ne 0) { Write-Host "Le téléchargement a échoué."; return }
} else {
  $zip = Join-Path $env:TEMP "plausible-ce-$Version.zip"
  $tmp = Join-Path $env:TEMP "plausible-ce-$Version"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -OutFile $zip `
      -Uri "https://github.com/plausible/community-edition/archive/refs/heads/v$Version.zip" -ErrorAction Stop
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $zip -DestinationPath $tmp -ErrorAction Stop
    $extrait = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    Move-Item -Path $extrait.FullName -Destination $Dossier -ErrorAction Stop
    Remove-Item -Recurse -Force $zip, $tmp
  } catch {
    Write-Host "Le téléchargement a échoué : $($_.Exception.Message)"
    return
  }
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
Write-Host "Premier démarrage : environ 800 Mo à télécharger, 2 à 5 minutes…"
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  Write-Host "Le démarrage a échoué (message ci-dessus). Copie-le pour obtenir de l'aide."
  return
}
for ($i = 0; $i -lt 120; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop | Out-Null
    Write-Host ""
    Write-Host "Plausible est prêt : http://localhost:$Port"
    Write-Host "Crée ton compte sur cette page, puis ajoute ton site (étape 2 du guide)."
    Start-Process "http://localhost:$Port"
    return
  } catch {
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 5
  }
}
Write-Host ""
Write-Host "La page ne répond pas encore. Pour voir où ça en est :"
Write-Host "  cd `"$Dossier`"; docker compose logs -f plausible"
