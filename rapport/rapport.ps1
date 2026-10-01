# Crée le rapport mensuel d'un site client, sans installer Node : le script tourne
# dans Docker, comme Plausible.
#
#   powershell -ExecutionPolicy Bypass -File rapport\rapport.ps1 -Demo
#   powershell -ExecutionPolicy Bypass -File rapport\rapport.ps1 -Site boutique.fr
#   powershell -ExecutionPolicy Bypass -File rapport\rapport.ps1 -Site boutique.fr -Mois 2026-09
#
# La clé d'API (Plausible : Settings → API keys) est demandée une seule fois, puis
# gardée dans %USERPROFILE%\.plausible-api-key (jamais dans le dépôt).

param(
  [string]$Site = '',
  [string]$Mois = '',
  [string]$Plausible = 'http://localhost:8000',
  [string]$Agence = 'Ton agence',
  [switch]$Demo
)

$racine = Split-Path -Parent $PSScriptRoot
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker ne tourne pas : lance Docker Desktop, puis relance."; return }

$cle = ''
if (-not $Demo) {
  if (-not $Site) { Write-Host "Indique le site : -Site boutique.fr (ou -Demo pour un exemple)."; return }
  $fichierCle = Join-Path $HOME '.plausible-api-key'
  if (Test-Path $fichierCle) { $cle = (Get-Content $fichierCle -Raw).Trim() }
  else {
    $cle = (Read-Host "Clé d'API Plausible (Settings → API keys)").Trim()
    if (-not $cle) { return }
    Set-Content -Path $fichierCle -Value $cle -NoNewline
  }
}

# Depuis Docker, « localhost » désigne le conteneur : on vise l'ordinateur hôte
$url = $Plausible -replace '//(localhost|127\.0\.0\.1)', '//host.docker.internal'

$arguments = @()
if ($Demo) { $arguments += '--demo' } else { $arguments += $Site }
if ($Mois) { $arguments += $Mois }

docker run --rm --add-host=host.docker.internal:host-gateway -v "${racine}:/app" -w /app `
  -e "PLAUSIBLE_URL=$url" -e "PLAUSIBLE_API_KEY=$cle" -e "AGENCE=$Agence" `
  node:22-alpine node rapport/rapport.mjs @arguments
if ($LASTEXITCODE -ne 0) { return }

$dernier = Get-ChildItem (Join-Path $racine 'rapports') -Filter *.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($dernier) { Start-Process $dernier.FullName }
