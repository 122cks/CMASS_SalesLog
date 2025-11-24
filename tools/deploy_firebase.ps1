
<#
  Simple PowerShell helper to deploy Firebase Hosting.
  Usage:
    # interactive (will open browser to login if needed)
    .\tools\deploy_firebase.ps1

    # non-interactive using token (CI or manual):
    $env:FIREBASE_TOKEN = '...'
    .\tools\deploy_firebase.ps1 -UseToken

  This helper prefers a globally installed firebase CLI, then falls back to npx.
#>
param(
  [switch]$UseToken
)

function Get-Exec { param($cmd) if (Get-Command $cmd -ErrorAction SilentlyContinue) { return $cmd } return $null }

$cwd = Split-Path -Path $MyInvocation.MyCommand.Definition -Parent
Set-Location -Path (Join-Path $cwd '..')

Write-Host "Deploying Firebase Hosting from: $(Get-Location)"

$firebaseCmd = Get-Exec -cmd 'firebase'
if ($firebaseCmd) {
  Write-Host "Using global firebase CLI"
  $deployCmd = "firebase deploy --only hosting"
} else {
  Write-Host "Using npx firebase-tools"
  $deployCmd = "npx firebase-tools deploy --only hosting"
}

if ($UseToken) {
  if (-not $env:FIREBASE_TOKEN) { Write-Error "FIREBASE_TOKEN environment variable not set."; exit 2 }
  $deployCmd = $deployCmd + " --token $env:FIREBASE_TOKEN"
}

Write-Host "Running: $deployCmd"
iex $deployCmd
<#
  deploy_firebase.ps1
  Simple helper to deploy the `public/` folder to Firebase Hosting from PowerShell.
  It will prefer the globally-installed `firebase` CLI if available, otherwise use `npx firebase-tools`.

  Usage (PowerShell):
    .\tools\deploy_firebase.ps1

  Notes:
  - You must be logged in to Firebase CLI (run `firebase login`) or supply a FIREBASE_TOKEN
    (CI/automation) exported to the environment.
  - This script does not store credentials and will call the CLI directly.
#>

Param()

Push-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Definition)
Push-Location ..

function Invoke-FirebaseDeploy {
    param([string]$deployArgs)
    try {
        Write-Host "Checking for global firebase CLI..." -ForegroundColor Cyan
        $ver = & firebase --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Using global firebase CLI: $ver" -ForegroundColor Green
            & firebase $deployArgs
            return $LASTEXITCODE
        }
    } catch {
        # ignore
    }

    Write-Host "Falling back to npx firebase-tools (will download if necessary)..." -ForegroundColor Yellow
    & npx firebase-tools $deployArgs
    return $LASTEXITCODE
}

# Ensure public exists
if (-not (Test-Path -Path './public')) {
    Write-Host "Error: ./public folder not found. Run this script from the repo root." -ForegroundColor Red
    Pop-Location; Pop-Location; exit 2
}

# Deploy hosting only
 $deployArgs = 'deploy --only hosting'
Write-Host "Running: firebase $deployArgs" -ForegroundColor Cyan
$rc = Invoke-FirebaseDeploy $deployArgs

if ($rc -ne 0) {
    Write-Host "Firebase deploy failed with exit code $rc" -ForegroundColor Red
} else {
    Write-Host "Firebase deploy finished successfully." -ForegroundColor Green
}

Pop-Location; Pop-Location
