# Deploy + Probe helper

What this contains:

- `tools/deploy_and_probe.ps1` — PowerShell script that runs up to N deploy+probe iterations against your Firebase Hosting site. It:
  - deploys `public/` to the Firebase Hosting project you specify,
  - runs the Node/Playwright probe located at `tools/targeted_probe.js` against the live URL,
  - stores per-iteration results in `tools/remote_probe_result_<n>.json` and screenshots in `tools/remote_probe_<n>.png`.

Prerequisites
- Firebase CLI installed and authenticated. For non-interactive CI you need a token created via:

```powershell
firebase login:ci
```

Set the returned token into the environment variable `FIREBASE_TOKEN` (or configure it as a secret in CI):

Windows (PowerShell):

```powershell
$env:FIREBASE_TOKEN = '<your-token-here>'
```

Usage (local)

```powershell
# Run with defaults (project 'cmass-sales', target url "https://cmass-sales.web.app/meeting.html")
.
\tools\deploy_and_probe.ps1

# Or specify args
.
\tools\deploy_and_probe.ps1 -Project "cmass-sales" -DeployUrl "https://your-site.web.app/meeting.html" -MaxIterations 3
```

Notes
- The script expects `tools/targeted_probe.js` to accept `--url` or `--target` and `--out` and `--screenshot`. If your probe uses different CLI flags, edit the `Run-Probe` function in the PS script.
- The script requires `FIREBASE_TOKEN` in the environment for non-interactive deploys. If you prefer interactive login, run with `-InteractiveLogin` and have an operator do `firebase login` first.

CI: GitHub Actions
- There's a workflow stub in `.github/workflows/deploy_probe.yml` you can enable; it requires the repo secret `FIREBASE_TOKEN`.

Security
- Treat `FIREBASE_TOKEN` as a secret. Do NOT commit it to the repository.
