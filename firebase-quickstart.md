Firebase Quickstart (POC)

Goal: Use existing frontend to store visits in Firestore using a minimal client-side integration.

1) Create a Firebase project (or use your existing one).
   - Enable Firestore in Native mode.

2) Add a web app in the Firebase Console and copy the firebaseConfig object.
   - It looks like:
     {
       apiKey: "...",
       authDomain: "...",
       projectId: "...",
       storageBucket: "...",
       messagingSenderId: "...",
       appId: "..."
     }

3) Expose the config to the page when serving.
   - Quick local way: edit `sales-input.html` and before the Firebase helper script add:

     <script>
       window.FIREBASE_CONFIG = { /* paste config here */ };
     </script>

   - Better: inject via templating or set as an environment-specific served file.

4) Firestore collection used: `visits` (each document has fields: created_at, staff, visit_date, payload)

5) Security & production notes:
   - For POC you may allow open writes to authenticated users using Firebase Auth.
   - For internal use, prefer restricting writes via Authentication (Firebase Auth with company SSO if available) and Firestore Security Rules.
   - For production, consider using a backend (Cloud Run) to validate and sanitize payloads before writing to Firestore.

6) Testing:
   - Start the server and open the page. Add visits and click "서버에 저장" — it will prefer Firebase if FIREBASE_CONFIG is present.
   - Check Firestore collection `visits` in the console for documents.

If you want, I can:
- Add an example `window.FIREBASE_CONFIG` insertion into `sales-input.html` (temporary) so you can test locally.
- Provide Firestore security rules that restrict writes to authenticated company users.
- Add a Cloud Function or a small backend to proxy and validate writes if you don't want client-side direct writes.

---

Deploy frontend to Firebase Hosting and backend to Cloud Run (recommended for production/internal):

Prereqs:
- Install `gcloud` and `firebase-tools` and login: `gcloud auth login` and `firebase login`.
- Set project: `gcloud config set project YOUR_PROJECT_ID` and `firebase use --add YOUR_PROJECT_ID`.

Steps (PowerShell):

1) Build and push backend container to Google Container Registry (or Artifact Registry):

```powershell
# from repo root (where CMASS_SalesLog lives)
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cmass-saleslog .
```

2) Deploy to Cloud Run:

```powershell
gcloud run deploy cmass-saleslog --image gcr.io/YOUR_PROJECT_ID/cmass-saleslog --region us-central1 --platform managed --allow-unauthenticated
```

3) Configure `firebase.json` rewrites (already added) so Hosting routes `/api/**` to the Cloud Run service.

4) Deploy Hosting (serves static `CMASS_SalesLog` folder):

```powershell
firebase deploy --only hosting
```

After that, your site will be served by Firebase Hosting; API calls to `/api/...` will be routed to the Cloud Run service.

Notes:
- If you want the site only available internally, restrict access using Cloud Run IAM (remove allow-unauthenticated) and use Cloud Identity-Aware Proxy (IAP) for user-level access control, or keep it public but rely on soft access (company-only) per your note.
- Update `.firebaserc` to point to your project id.

Quick checklist to test locally with your Firebase project
1) In Firebase Console -> Project settings -> Your apps -> SDK snippet, copy the config object.
2) Paste it at the top of `CMASS_SalesLog/sales-input.html` (inside a script tag) as `window.FIREBASE_CONFIG = { ... };`.
3) Optionally, update `CMASS_SalesLog/firestore.rules` and deploy rules:

```powershell
firebase deploy --only firestore:rules
```

4) Start a local HTTP server from repo root and open the hosted page (or use Firebase Hosting local serve):

```powershell
# from project root
python -m http.server 8000
# or use firebase serve (firebase-tools)
firebase emulators:start --only hosting,firestore
```

5) Use the page to add a visit and click "서버에 저장" (will write into Firestore if FIREBASE_CONFIG is set).


