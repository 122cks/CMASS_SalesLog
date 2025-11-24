<#
PowerShell deployment check for CMASS SalesLog
Usage:
  Open PowerShell in repo root and run:
    .\scripts\check_deploy.ps1 -Site "https://cmass-sales.web.app" -StaffToken "SongHoonjae"

What it checks:
 - /firebase-config.json existence and JSON validity
 - /api/visits endpoint response
 - basic fetch of /geocodes.json
 - reports results and guidance for fixes
#>
param(
  [Parameter(Mandatory=$true)] [string] $Site,
  [Parameter(Mandatory=$true)] [string] $StaffToken
)

Write-Host "Checking deployment at: $Site" -ForegroundColor Cyan

function TryFetchJson([string]$url){
  try{
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -ErrorAction Stop
    $ct = $resp.Headers['Content-Type'] -as [string]
    if (-not $resp.StatusCode -eq 200){ return @{ ok=$false; status=$resp.StatusCode; body=$resp.Content; contentType=$ct } }
    try{ $j = $null; $j = $resp.Content | ConvertFrom-Json; return @{ ok=$true; json=$j; body=$resp.Content; contentType=$ct } }catch{ return @{ ok=$false; status=200; body=$resp.Content; contentType=$ct; parseError=$_.Exception.Message } }
  }catch{ return @{ ok=$false; error=$_.Exception.Message } }
}

# 1) check firebase-config.json
$fcUrl = $Site.TrimEnd('/') + "/firebase-config.json"
Write-Host "\n1) Checking firebase-config.json -> $fcUrl" -ForegroundColor Yellow
$fc = TryFetchJson $fcUrl
if ($fc.ok){ Write-Host "  OK: firebase-config.json found and parsed as JSON." -ForegroundColor Green; Write-Host "  projectId: "($fc.json.projectId) } else { Write-Host "  FAIL: firebase-config.json missing or invalid." -ForegroundColor Red; if ($fc.error){ Write-Host "    error: $($fc.error)" } elseif ($fc.parseError){ Write-Host "    parseError: $($fc.parseError)" } else { Write-Host "    response snippet: $($fc.body | Select-Object -First 1)" } }

# 2) check /api/visits
$apiUrl = $Site.TrimEnd('/') + "/api/visits?start=2025-11-01&end=2025-11-06&staff=" + [System.Uri]::EscapeDataString($StaffToken)
Write-Host "\n2) Checking API endpoint -> $apiUrl" -ForegroundColor Yellow
$api = TryFetchJson $apiUrl
if ($api.ok){ Write-Host "  OK: /api/visits returned JSON." -ForegroundColor Green; if ($api.json.ok -ne $null){ Write-Host "  API OK flag: $($api.json.ok)" } else { Write-Host "  API returned JSON but no 'ok' flag; shape: ";$api.json | Get-Member -MemberType NoteProperty | ForEach-Object { Write-Host "    - $($_.Name)" } } } else { Write-Host "  FAIL: /api/visits fetch failed or returned non-JSON." -ForegroundColor Red; if ($api.error){ Write-Host "    error: $($api.error)" } else { Write-Host "    response snippet: $($api.body | Out-String).Substring(0,300)" } }

# 3) check geocodes.json presence
$gUrl = $Site.TrimEnd('/') + "/geocodes.json"
Write-Host "\n3) Checking geocodes.json -> $gUrl" -ForegroundColor Yellow
$g = TryFetchJson $gUrl
if ($g.ok){ Write-Host "  OK: geocodes.json found." -ForegroundColor Green } else { Write-Host "  WARN: geocodes.json missing or non-JSON (map may be empty)." -ForegroundColor DarkYellow }

# summary guidance
Write-Host "\nSummary:" -ForegroundColor Cyan
if (-not $fc.ok){ Write-Host " - Add a JSON file at /public/firebase-config.json with your Firebase web app config and redeploy hosting. See docs/MIGRATE.md for details." -ForegroundColor Yellow } else { Write-Host " - firebase-config.json present." -ForegroundColor Green }
if (-not $api.ok){ Write-Host " - The API endpoint /api/visits is unreachable or returning non-JSON. Check hosting rewrites in firebase.json or deploy your Cloud Functions that provide /api/visits." -ForegroundColor Yellow } else { Write-Host " - API endpoint /api/visits is reachable." -ForegroundColor Green }
if (-not $g.ok){ Write-Host " - Optional: Add geocodes.json for map markers or expect empty map." -ForegroundColor Yellow }

Write-Host "\nIf you'd like me to propose code changes, paste in your 'firebase.json' and (if present) functions source (e.g., functions/index.js) and I'll create patches." -ForegroundColor Cyan
Write-Host "If you want me to run the migration locally for you, run the migrate script in docs/MIGRATE.md (requires service account key)." -ForegroundColor Cyan

Write-Host "\nDone." -ForegroundColor Green
