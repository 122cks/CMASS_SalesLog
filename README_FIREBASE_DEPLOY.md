Firebase Hosting deploy instructions (PowerShell)

Project info provided by you:
- Project name: CMASS-SALES
- Project ID: cmass-sales
- Project number: 918981476485

This project will host static files from the `public` folder.
Routes to publish:
- `/` -> `public/index.html`
- `/front` -> `public/front.html`
- `/sales-input` -> `public/sales-input.html`

What I changed for you:
- `firebase.json` — hosting config (public folder, cleanUrls enabled, and explicit rewrites for `/front` and `/sales-input`).
- `.firebaserc` — set the default project id to `cmass-sales`.

Quick deploy steps (PowerShell)

1) Install the Firebase CLI (if not installed):
```powershell
npm install -g firebase-tools
```

2) Login to Firebase:
```powershell
firebase login
```

3) Make sure you're in the project root:
```powershell
cd 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog'
```

4) Ensure the `public` folder contains the three files (`index.html`, `front.html`, `sales-input.html`):
```powershell
Get-ChildItem -Path .\public\ -Name
```

5) Select the Firebase project (two options):
- Option A — use the project id directly (non-interactive):
```powershell
firebase use cmass-sales
```
- Option B — add/select via interactive prompt:
```powershell
firebase use --add
```

6) Deploy hosting:
```powershell
firebase deploy --only hosting
```

What to expect:
- If deploy succeeds, the CLI prints your hosting URL like `https://cmass-sales.web.app` (and `https://cmass-sales.firebaseapp.com` if enabled).

Local preview (optional):
```powershell
firebase emulators:start --only hosting
```
Then open the local URL shown (often http://localhost:5000).

Notes and troubleshooting:
- I already set `.firebaserc` to use `cmass-sales`. If you don't see the project when running `firebase use cmass-sales`, ensure your logged-in account has access to that project, or run `firebase login` with the correct account.
- If files are missing in `public`, add them before deploying.
- If you'd like different behavior for trailing slashes or SPA rewrites, tell me and I can update `firebase.json` accordingly.

If you want, I can also add a small `deploy.ps1` script to automate these steps locally. Would you like that?
