<#
Usage: Run this PowerShell script interactively and replace placeholders.
This script prints the commands you should run to deploy the backend to Cloud Run and wire the Firestore service account via Secret Manager.
#>

param(
    [string]$ProjectId = 'YOUR_PROJECT_ID',
    [string]$Region = 'us-central1',
    [string]$ServiceAccountJsonPath = 'C:\path\to\service-account.json'
)

if (-not (Test-Path $ServiceAccountJsonPath)) {
    Write-Error "Service account JSON not found at $ServiceAccountJsonPath"
    return
}

Write-Output "1) Create Secret Manager secret (one-time)"
Write-Output "gcloud secrets create cmass-firebase-sa --project $ProjectId --data-file='$ServiceAccountJsonPath'"

Write-Output "\n2) Build and push container image"
Write-Output "docker build -t gcr.io/$ProjectId/cmass-sales-backend ./backend"
Write-Output "docker push gcr.io/$ProjectId/cmass-sales-backend"

Write-Output "\n3) Deploy to Cloud Run and mount secret as env var FIREBASE_CREDENTIALS_JSON"
Write-Output "gcloud run deploy cmass-sales-backend --image gcr.io/$ProjectId/cmass-sales-backend --region $Region --platform managed --allow-unauthenticated --set-secrets FIREBASE_CREDENTIALS_JSON=cmass-firebase-sa:latest --project $ProjectId"

Write-Output "\n4) Confirm service URL"
Write-Output "gcloud run services describe cmass-sales-backend --region $Region --project $ProjectId --format 'value(status.url)'"

Write-Output "\n5) (Optional) Update firebase.json rewrites to route /api/** to the Cloud Run serviceId 'cmass-sales-backend' in region $Region, then run:"
Write-Output "firebase deploy --only hosting"

Write-Output "\nNotes: Use Secret Manager rather than setting raw env vars. To remove secret: gcloud secrets delete cmass-firebase-sa --project $ProjectId"
