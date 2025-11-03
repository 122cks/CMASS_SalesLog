Firebase Hosting deploy instructions (frontend only)

Overview
- This repository already contains `firebase.json` configured to serve the project root (`"public": "."`).
- The hosting configuration includes a rewrite for `/api/**` to a Cloud Run service `cmass-sales-backend` in `us-central1` and otherwise falls back to `index.html`.

Important security note
- The NEIS API key is currently referenced in client-side JS for local testing. For production you should move the NEIS key to your backend (Cloud Run) and have the frontend call your backend API so the key is not exposed publicly.

Quick deploy steps (PowerShell)
1) Install firebase-tools (if not installed):

```powershell
npm install -g firebase-tools
```

2) Login to Firebase:

```powershell
firebase login
```

3) Select or set your Firebase project (replace PROJECT_ID):

```powershell
firebase use PROJECT_ID
```

4) Deploy hosting:

```powershell
firebase deploy --only hosting
```

Or use the provided script (from repo root):

```powershell
# replace with your project id
./deploy_frontend.ps1 -ProjectId PROJECT_ID
```

Post-deploy
- After deploy, open the site from the Firebase console or run:

```powershell
firebase open hosting:site
```

Testing
- Open the deploy URL and verify `sales-input.html` loads and the UI behaves. If NEIS calls fail due to CORS or missing key, consider using the backend proxy (Cloud Run) referenced by the `rewrites` in `firebase.json`.

If you want, I can also:
- Add a small environment placeholder file (`.env.example`) showing where to put the NEIS key for the backend.
- Create a CI workflow (GitHub Actions) to automatically deploy on push to `main`.
