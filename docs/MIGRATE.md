Firestore migration: visits -> visit_entries

This documents how to migrate legacy `visits` documents into the `visit_entries` collection so the dashboard (`/front`) will find and display them.

Prerequisites
- Node.js installed (12+)
- A Firebase service account JSON key with Firestore access for your project
- The target project ID

Install dependencies

Open PowerShell in the repository root and run:

```powershell
npm install firebase-admin minimist
```

Script
- `scripts/migrate_visits_to_visit_entries.js` is included in this repo.

Example commands

Dry-run (no writes):

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\service-account.json'
node .\scripts\migrate_visits_to_visit_entries.js --project your-firebase-project-id --staff SongHoonjae --limit 50 --dry-run
```

Actual run:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\service-account.json'
node .\scripts\migrate_visits_to_visit_entries.js --project your-firebase-project-id --staff SongHoonjae --limit 500
```

Notes
- The script adds a field `legacy_id` to created `visit_entries` docs (and sets `legacy_collection` = 'visits'). It also sets `migratedAt` (server timestamp) and marks the original `visits` doc with `migratedToVisitEntries: true` to avoid double-migration.
- The mapper is best-effort. If your legacy docs use non-standard field names, open the script and adjust `mapLegacyToVisitEntry()`.
- Timezones: the script stores `visitDate` as YYYY-MM-DD and computes `visitStart` / `visitEnd` as ISO timestamps when possible. Verify timezone semantics with your data before running wide migrations.

If you'd like, I can:
- Extend the mapper to map additional fields exactly as your dashboard expects.
- Provide a Cloud Function or admin console script to run in a secure environment.
- Run a sample migration if you provide credentials (not recommended to share secrets here).

Quick deploy diagnostic
----------------------
I added a small PowerShell diagnostic script at `scripts/check_deploy.ps1` that helps locate the 404/non-JSON issues described in the front-page console. Example usage:

```powershell
.\scripts\check_deploy.ps1 -Host "https://cmass-sales.web.app" -Staff "SongHoonjae"
```

The script checks:
- whether `/firebase-config.json` is present and valid JSON
- whether `/api/visits` returns JSON
- whether `/geocodes.json` is present (map data)

Run it locally and paste the output here if you'd like me to generate specific code patches (e.g. edits to `firebase.json` rewrites or a functions patch).

Deploying the server API (optional but recommended)
-----------------------------------------------
If you'd like the dashboard to use a server-side API (so client Firestore rules aren't required), deploy the Cloud Functions we added under `functions/` and the hosting rewrite. Steps:

1. Install functions dependencies (from repo root):

```powershell
cd functions
npm install
cd ..
```

2. Deploy functions and hosting together:

```powershell
npx firebase deploy --only functions,hosting
```

3. Verify the API endpoint:

```powershell
Invoke-WebRequest -Uri 'https://cmass-sales.web.app/api/visits?start=2025-11-01&end=2025-11-06&staff=SongHoonjae' -UseBasicParsing
```

If the call returns JSON with `ok:true` and `rows`, the functions deployment and rewrite are working. After this, the front page should receive JSON from `/api/visits` and show visits even if client Firestore rules are restrictive.
