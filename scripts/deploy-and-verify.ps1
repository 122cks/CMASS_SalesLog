<#
.SYNOPSIS
  Helper script to backup any stray C:\firebase.json, deploy Firebase Hosting using the project-local firebase.json,
  and perform quick curl checks to verify the known routes.

USAGE
  # From PowerShell (may require Administrator to rename C:\firebase.json)
  Set-Location 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog'
  .\scripts\deploy-and-verify.ps1 -ProjectId cmass-sales

  # Or without project id (uses .firebaserc or default credentials)
  .\scripts\deploy-and-verify.ps1

NOTES
  - This script only prepares and runs commands locally on your machine. It does not require me to run anything remotely.
  - If a C:\firebase.json exists it will be renamed to firebase.json.bak. Running PowerShell as Administrator may be required.
  - Outputs are written into .\scripts\output for easy copy/paste back to me.
#>

param(
  [string]$ProjectId
)

Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root

New-Item -Path .\output -ItemType Directory -Force | Out-Null

$global:ErrorActionPreference = 'Stop'

Try {
  # Backup stray C:\firebase.json if present
  $sysConfig = 'C:\firebase.json'
  if (Test-Path $sysConfig) {
    Write-Host "Found $sysConfig — renaming to firebase.json.bak"
    $bak = 'C:\firebase.json.bak'
    Rename-Item -Path $sysConfig -NewName (Split-Path $bak -Leaf) -Force
    "RENAMED $sysConfig -> $bak" | Out-File .\output\sys-firebase-backup.txt -Encoding utf8
  } else {
    Write-Host "No C:\firebase.json found — skipping backup"
    "NO_SYS_CONFIG" | Out-File .\output\sys-firebase-backup.txt -Encoding utf8
  }

  # Ensure local files exist
  if (-not (Test-Path .\firebase.json)) { throw "Project-local firebase.json not found in $PWD" }

  # Deploy hosting
  $deployCmd = 'firebase deploy --only hosting --config .\firebase.json'
  if ($ProjectId) { $deployCmd += " --project $ProjectId" }

  Write-Host "Running: $deployCmd"
  & cmd /c $deployCmd 2>&1 | Tee-Object -FilePath .\output\firebase-deploy.log

  # Quick curl checks (no-cache)
  $urls = @(
    'https://cmass-sales.web.app/?nocache=1',
    'https://cmass-sales.web.app/front?nocache=1',
    'https://cmass-sales.web.app/input?nocache=1',
    'https://cmass-sales.web.app/meeting?nocache=1',
    'https://cmass-sales.web.app/report?nocache=1'
  )

  foreach ($u in $urls) {
    $fn = ($u -replace 'https?://','') -replace '[^A-Za-z0-9]','_' -replace '__+','_'
    $out = .\output\curl_$fn.txt
    Write-Host "Curling $u -> $out"
    & curl.exe -I $u 2>&1 | Tee-Object -FilePath $out
  }

  Write-Host "All done. Logs saved to .\scripts\output\"
  Pop-Location
  exit 0
} Catch {
  Write-Error "ERROR: $_"
  "ERROR: $_" | Out-File .\output\error.txt -Encoding utf8
  Pop-Location
  exit 1
}
