CMASS SalesLog - Backend

This is a minimal Flask backend to accept day-visit JSON payloads from the `sales-input.html` frontend.

Run locally:

# create and activate virtualenv (Windows PowerShell)
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py

API endpoints

- POST /api/visits
  - JSON body: the frontend sends a full visit payload (see `sales-input.html`). The server stores the payload under a `payload` key and adds `created_at` and `id`.

- GET /api/kpis
  - Returns computed KPIs aggregated from stored visit payloads.
  - Query params supported: `from`, `to` (ISO dates), `manager`, `region`.
  - KPIs include: `total_visits`, `visits_by_date`, `visits_by_manager`, `visits_by_region`, `contacts_total`, `contacts_by_date`, `chat_invites_total`, `chat_invites_by_date`.

- GET /api/weekly-report
  - Generates a weekly report (default: last 7 days ending today UTC).
  - Optional query params: `from` and `to` (ISO dates) to request a custom window.
  - Response contains `period`, `totals` (visits, contacts, chat_invites), `by_date` breakdowns, and breakdowns by manager and region.

Secrets & deployment notes

- The PIN map used by `/api/pin-check` is loaded from the `PIN_MAP_JSON` environment variable when present. For production we store the PIN map in Secret Manager under the secret name `cmass_pin_map` and inject it into Cloud Run as the `PIN_MAP_JSON` env var.

- When mounting a Secret Manager secret into Cloud Run, the revision service account must have the Secret Manager Secret Accessor role (roles/secretmanager.secretAccessor). Example (run as a project owner/editor):

```powershell
gcloud projects add-iam-policy-binding cmass-sales --member="serviceAccount:YOUR_SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor"
```

Replace `YOUR_SERVICE_ACCOUNT` with the Cloud Run revision service account (for example `918981476485-compute@developer.gserviceaccount.com` in this project).

You can also grant the role on the specific secret:

```powershell
gcloud secrets add-iam-policy-binding cmass_pin_map --member="serviceAccount:YOUR_SERVICE_ACCOUNT" --role="roles/secretmanager.secretAccessor" --project=cmass-sales
```

After granting the role, redeploy Cloud Run with `--update-secrets=PIN_MAP_JSON=cmass_pin_map:latest` and set `ALLOWED_ORIGINS` to restrict CORS.
