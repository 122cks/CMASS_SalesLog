Firebase deploy instructions

1) Install Firebase CLI (only if you don't have it)

```powershell
npm install -g firebase-tools
```

2) Login via browser

```powershell
firebase login
```

3) (Optional) If you haven't initialized hosting before run:

```powershell
firebase init hosting
```

4) Deploy to the provided project (cmass-sales)

```powershell
firebase deploy --only hosting --project cmass-sales
# or without installing globally:
npx firebase-tools deploy --only hosting --project cmass-sales
```

Notes:
- These repo files now include `firebase.json` and `.firebaserc` configured to use `public/` as the hosting folder and the project id `cmass-sales`.
- You must run `firebase login` locally to authenticate before deploy. If you prefer CI deploy, generate a `FIREBASE_TOKEN` via `firebase login:ci` and add it to your CI secrets.
