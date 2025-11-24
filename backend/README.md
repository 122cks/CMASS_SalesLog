# Backend (Flask) — Firestore integration

This backend serves the sales logs API and can optionally persist data to Cloud Firestore.

How to enable Firestore
- Provide a service account JSON file and set environment variable `FIREBASE_SERVICE_ACCOUNT` to its path, OR
- Provide the JSON content directly via `FIREBASE_CREDENTIALS_JSON` environment variable.

Install dependencies (recommended in a virtualenv):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run locally (without Firestore):

```powershell
python app.py
```

Run locally (with Firestore):

```powershell
$env:FIREBASE_SERVICE_ACCOUNT = 'C:\path\to\serviceAccount.json'
python app.py
```

API endpoints
- GET /sales — list sales logs
- POST /sales — create sales log (JSON body)
- GET /sales/<id> — fetch single
- PUT /sales/<id> — update
- DELETE /sales/<id> — delete

If Firestore is enabled the backend will use the `sales_logs` collection.
