<#
.SYNOPSIS
  Deploy hosting to Firebase and run the Playwright probe up to N iterations.

.DESCRIPTION
  This helper automates: (1) firebase hosting deploy, (2) run the local Node/Playwright probe
  against the deployed URL, (3) collect logs/screenshots. Stops early if probe returns success.

.NOTES
  - Requires the Firebase CLI to be installed and an authentication token in $env:FIREBASE_TOKEN
    (create one with `firebase login:ci`), or run interactively with `firebase login`.
  - Assumes the probe script is located at tools/targeted_probe.js and can accept a `--target` or
    `--url` argument (adjust the invocation in this script if your probe uses a different flag).
#>

param(
    [string]$Project = "cmass-sales",
    [string]$DeployUrl = "https://cmass-sales.web.app/meeting.html",
    [int]$MaxIterations = 5,
    [string]$ProbeScript = "tools/targeted_probe.js",
    [switch]$InteractiveLogin
)

function Ensure-FirebaseToken {
    if (-not $env:FIREBASE_TOKEN) {
        if ($InteractiveLogin) {
            Write-Host "FIREBASE_TOKEN not found. Attempting interactive firebase login..."
            & firebase login
            if (-not $?) { throw "firebase login failed" }
            Write-Host "After interactive login you can create a CI token with: firebase login:ci"
        } else {
            throw "FIREBASE_TOKEN environment variable is not set. Run 'firebase login:ci' and set FIREBASE_TOKEN before running this script."
        }
    }
}

function Run-Probe {
    param($iteration, $url)
    $outJson = "tools/remote_probe_result_$iteration.json"
    $outScreenshot = "tools/remote_probe_$iteration.png"

    Write-Host "Running probe (iteration $iteration) against $url"

    # Try two common flag names for the probe script. Adjust if your probe expects different args.
    $nodeCmd = "node"
    $args1 = @($ProbeScript, "--url", $url, "--out", $outJson, "--screenshot", $outScreenshot)
    $args2 = @($ProbeScript, "--target", $url, "--out", $outJson, "--screenshot", $outScreenshot)

    & $nodeCmd @args1 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "First probe invocation failed; retrying with alternate flag names..."
        & $nodeCmd @args2 2>&1
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Probe failed. Exit code: $LASTEXITCODE"
        return @{ ok = $false }
    }

    Write-Host "Probe completed. Result JSON: $outJson, screenshot: $outScreenshot"
    return @{ ok = $true; out = $outJson; screenshot = $outScreenshot }
}

try {
    Write-Host "Deploy + Probe helper starting (project=$Project, url=$DeployUrl, max=$MaxIterations)"

    Ensure-FirebaseToken

    for ($i = 1; $i -le $MaxIterations; $i++) {
        Write-Host "\n=== Iteration $i / $MaxIterations ==="

        # Deploy
        $deployMsg = "auto-deploy-iteration-$i"
        Write-Host "Deploying hosting (firebase deploy --only hosting)"
        $deployCmd = @("firebase","deploy","--only","hosting","--project",$Project,"--message",$deployMsg,"--token",$env:FIREBASE_TOKEN)
        & $deployCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Firebase deploy failed (exit $LASTEXITCODE). Aborting loop."; exit $LASTEXITCODE
        }

        # Run probe
        $probeResult = Run-Probe -iteration $i -url $DeployUrl
        if (-not $probeResult.ok) {
            Write-Host "Probe failed for iteration $i. See probe output above."
            # continue to next iteration so you can try again, or exit depending on your policy.
        } else {
            # attempt to read JSON result and check a 'errors' key, otherwise treat as success.
            try {
                $json = Get-Content -Raw $probeResult.out | ConvertFrom-Json
                if ($json.errors -and $json.errors.Count -gt 0) {
                    Write-Host "Probe reported errors: `n$json.errors"
                } else {
                    Write-Host "Probe passed (no errors). Stopping early."
                    break
                }
            } catch {
                Write-Host "Could not parse probe output JSON; saved to $($probeResult.out). Stop condition not met."
            }
        }
    }
    Write-Host "Done. Check tools/*.json and tools/*.png for artifacts."
} catch {
    Write-Host "Error: $_"; exit 1
}
