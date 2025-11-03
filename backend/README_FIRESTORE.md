Firestore setup for CMASS SalesLog backend

Overview
--------
This backend can persist submissions to Google Firestore. If no Firestore credentials are provided, the app runs with an in-memory list (volatile).

Provide credentials using one of two environment variables before starting the app:

1) FIREBASE_SERVICE_ACCOUNT -> path to a service account JSON file on disk

   $env:FIREBASE_SERVICE_ACCOUNT = 'C:\path\to\service-account.json'

2) FIREBASE_CREDENTIALS_JSON -> the service account JSON content (single-line string)

   $json = Get-Content 'C:\path\to\service-account.json' -Raw
   $env:FIREBASE_CREDENTIALS_JSON = $json

Example (PowerShell):

  $env:FIREBASE_SERVICE_ACCOUNT = 'C:\secrets\cmass-sa.json'
  python .\backend\app.py

Or using the JSON string directly:

  $json = Get-Content 'C:\secrets\cmass-sa.json' -Raw
  $env:FIREBASE_CREDENTIALS_JSON = $json
  python .\backend\app.py

Verification
------------
When the server starts it will print either "Firestore enabled for backend" or "Firestore not configured - running with in-memory storage".

If Firestore is enabled, documents will be written to the collection named `sales_logs`.

Security
--------
Keep the service account JSON private. For Cloud Run deployments, use Secret Manager or set the credentials using the Cloud Run environment configuration rather than embedding JSON in source.

Notes
-----
If you deploy to Cloud Run, prefer mounting the service account via Secret Manager or use Workload Identity.
