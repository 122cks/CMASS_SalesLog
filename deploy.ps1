<#
deploy.ps1 - Simple Firebase Hosting deploy helper (PowerShell)

Usage (PowerShell):
  # Preferred: set environment var once in session and run:
  $env:FIREBASE_TOKEN = 'PASTE_YOUR_TOKEN_HERE'
  .\deploy.ps1

  # Or pass token explicitly (avoid leaking it to logs):
  .\deploy.ps1 -Token 'PASTE_YOUR_TOKEN_HERE'

Options:
  -Token <string>    : Firebase CI token (overrides $env:FIREBASE_TOKEN)
  -ProjectId <str>   : Optional firebase project id (adds --project)

This script prefers the environment variable $env:FIREBASE_TOKEN when -Token is not supplied.
It will try to run via 'npx firebase-tools' if 'npx' is available, otherwise falls back to 'firebase' if installed.
#>

param(
    [string]$Token = '',
    [string]$ProjectId = ''
)

function Write-Info($m){ Write-Host "[deploy.ps1] $m" -ForegroundColor Cyan }
function Write-Warn($m){ Write-Host "[deploy.ps1] WARNING: $m" -ForegroundColor Yellow }
function Write-Err($m){ Write-Host "[deploy.ps1] ERROR: $m" -ForegroundColor Red }

try {
    # Resolve token
    if (-not $Token -or $Token.Trim() -eq '') { $Token = $env:FIREBASE_TOKEN }

    if (-not $Token -or $Token.Trim() -eq '') {
        Write-Warn "No FIREBASE_TOKEN provided. Create one with 'firebase login:ci' and set it via:`n  $env:FIREBASE_TOKEN = '<token>'`nor pass -Token '<token>' to this script."
        exit 1
    }

    # Prepare argument list
    $deployArgs = @('deploy','--only','hosting','--token',$Token)
    if ($ProjectId -and $ProjectId.Trim() -ne '') {
        $deployArgs += '--project'
        $deployArgs += $ProjectId
        Write-Info "Using explicit project id: $ProjectId"
    }

    # Prefer npx if available (so global install not required)
    $npxCmd = Get-Command npx -ErrorAction SilentlyContinue
    if ($npxCmd) {
        Write-Info "Running via npx: npx firebase-tools $($deployArgs -join ' ')"
        $npxArgs = @('firebase-tools') + $deployArgs
        $proc = Start-Process -FilePath 'npx' -ArgumentList ($npxArgs) -NoNewWindow -Wait -PassThru
        if ($proc.ExitCode -ne 0) { Write-Err "Deploy failed (exit $($proc.ExitCode)). See output above."; exit $proc.ExitCode }
        Write-Info "Deploy completed successfully."
        exit 0
    }

    # If npx not available, try 'firebase' global command
    $firebaseCmd = Get-Command firebase -ErrorAction SilentlyContinue
    if ($firebaseCmd) {
        Write-Info "Running via global firebase CLI: firebase $($deployArgs -join ' ')"
        $proc = Start-Process -FilePath 'firebase' -ArgumentList ($deployArgs) -NoNewWindow -Wait -PassThru
        if ($proc.ExitCode -ne 0) { Write-Err "Deploy failed (exit $($proc.ExitCode)). See output above."; exit $proc.ExitCode }
        Write-Info "Deploy completed successfully."
        exit 0
    }

    Write-Warn "Neither 'npx' nor global 'firebase' CLI were found. Install Node.js and run 'npm install -g firebase-tools' or use npx (bundled with npm)."
    exit 2

} catch {
    Write-Err "Unexpected error: $($_.Exception.Message)"
    exit 3
}
