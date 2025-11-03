<#
Enable required Google Cloud APIs for the CMASS Sales project.
Run this as a user who has the appropriate project permissions (Owner or Service Usage Admin).
Usage (PowerShell):
  powershell -ExecutionPolicy Bypass -File .\scripts\enable_gcp_apis.ps1 -ProjectId 918981476485
#>
param(
  [Parameter(Mandatory=$false)]
  [string]$ProjectId = "918981476485"
)

function ExitWithMessage($msg, $code=1){ Write-Host $msg; exit $code }

# Check gcloud exists
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)){
  ExitWithMessage "gcloud CLI not found in PATH. Install Cloud SDK: https://cloud.google.com/sdk/docs/install"
}

Write-Host "Using project: $ProjectId"

# Login (interactive) if not already authenticated
try{
  $who = & gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
} catch {
  $who = $null
}
if (-not $who){
  Write-Host "No active gcloud account found. Running 'gcloud auth login'..."
  & gcloud auth login
  if ($LASTEXITCODE -ne 0) { ExitWithMessage "gcloud auth login failed" }
}

# Set project
& gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) { ExitWithMessage "Failed to set project $ProjectId" }

# Enable required services
$services = @(
  'run.googleapis.com',
  'cloudbuild.googleapis.com'
)
foreach($s in $services){
  Write-Host "Enabling $s for project $ProjectId..."
  gcloud services enable $s --project=$ProjectId
}

Write-Host "Waiting a few seconds for changes to propagate..."
Start-Sleep -Seconds 8

Write-Host "Checking enabled services for run.googleapis.com..."
$enabled = gcloud services list --enabled --project=$ProjectId | Select-String run.googleapis.com
if ($enabled) {
  Write-Host "run.googleapis.com is ENABLED"
  exit 0
} else {
  Write-Host "run.googleapis.com did not appear in the enabled list. Try waiting a minute and re-run the script."
  exit 2
}
