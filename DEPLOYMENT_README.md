Deployment notes

This project contains a small Flask app and static frontend. The repository includes a Dockerfile and docker-compose configuration for local testing and simple deployment.

Quick start (requires Docker & docker-compose):

1) Build and run:

   docker-compose up --build -d

2) Verify the app is reachable at http://localhost:5000

Running without docker (development):

1) Create a virtualenv and activate it.

   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

2) Install requirements:

   pip install -r requirements.txt

3) Run the app:

   python app.py

Notes and considerations:
- The container runs gunicorn with 3 workers. For low-traffic use this is fine; scale workers by CPU.
- SQLite file `visits.db` is created in the container at `/app/visits.db`. If you want persistent storage, mount a host volume for `/app/visits.db` or use a managed DB.
- For production behind a reverse proxy (nginx, Caddy), forward `/api/events` as an HTTP stream (EventSource) and ensure timeouts are high to avoid SSE disconnects.
- If you need automatic migration/backup, add scripts or use a more robust DB.

Firebase + Cloud Run deployment (recommended):

1) Prepare your Firebase project and enable Cloud Run and Container Registry / Artifact Registry.

2) Set your firebase project id in `.firebaserc` (replace YOUR_FIREBASE_PROJECT_ID).

3) Build & deploy via Cloud Build (this `cloudbuild.yaml` will build the container and deploy to Cloud Run):

   gcloud builds submit --config cloudbuild.yaml --project=YOUR_FIREBASE_PROJECT_ID

4) Configure `firebase.json` to rewrite `/api/**` to the deployed Cloud Run service (the `hosting.rewrites` section in `firebase.json` points `/api/**` to the Cloud Run `serviceId` configured above). Update `serviceId` to the Cloud Run service name if you changed it.

Notes:
- Cloud Run is recommended because Flask's SSE endpoint holds open connections — Cloud Run supports this pattern better than simple serverless functions.
- SQLite remains a local filesystem DB; for production consider migrating to Cloud SQL or other managed DB and update `app.py` DB connection logic.
