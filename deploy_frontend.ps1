# deploy_frontend.ps1
# PowerShell helper to deploy the frontend to Firebase Hosting.
# Usage:
# 1) Install Firebase CLI: npm i -g firebase-tools
# 2) Run this script: ./deploy_frontend.ps1 -ProjectId your-firebase-project-id

param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId
)

Write-Host "Deploying frontend to Firebase Hosting project: $ProjectId"
# ensure firebase tools available
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)){
  Write-Host "firebase CLI not found. Installing firebase-tools (requires npm)..." -ForegroundColor Yellow
  npm install -g firebase-tools
}

Write-Host "Logging into Firebase (you may be prompted in browser)..."
firebase login --no-localhost

Write-Host "Setting project to $ProjectId"
firebase use $ProjectId

Write-Host "Running deploy (hosting only)..."
firebase deploy --only hosting

Write-Host "Deploy finished. Use 'firebase open hosting:site' or check the Firebase console to view the site."