Run tests (pytest) and deployment steps

1) Install dependencies (in your repo virtualenv):

PowerShell:

  .\.venv\Scripts\Activate.ps1
  pip install -r backend/requirements.txt

2) Run tests (pytest):

  pip install pytest
  pytest backend/tests/test_filters.py -q

3) Deploy backend to Cloud Run (recommended flow)
  - Create a Secret Manager secret from your service account JSON
  - Build & push the backend container
  - Deploy to Cloud Run and attach the secret as FIREBASE_CREDENTIALS_JSON
  - Update `firebase.json` rewrites to route `/api/**` to your Cloud Run service and then run `firebase deploy --only hosting`

I included a helper PowerShell script `backend/deploy_steps.ps1` which prints the exact commands to run — edit the placeholders and run the printed commands.
