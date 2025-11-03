TWA (Trusted Web Activity) helper files

This repo includes helper files to package the hosted webapp as an Android app using Bubblewrap.

Steps (high level):

1. Install Bubblewrap (Node.js required):
   npm install -g @bubblewrap/cli

2. Initialize project using `twa-config.json` values:
   bubblewrap init --manifest ./twa-config.json

3. Build the app (you need Android SDK + Java JDK):
   bubblewrap build

4. After build, get the app's signing certificate SHA-256 fingerprint and paste it into `assetlinks-template.json`.
   Then host the JSON at: https://<host>/.well-known/assetlinks.json

5. Upload the final signed APK/AAB to devices (sideload) or distribute via Play Console.

Notes:
- Replace `packageId` in `twa-config.json` with your actual package name.
- If you need, I can generate the exact Bubblewrap commands for your environment or guide you through building the APK locally.
