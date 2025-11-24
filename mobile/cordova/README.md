# Cordova wrapper for CMASS web app

This folder contains a minimal Cordova config template to create an Android WebView wrapper that loads the hosted web app at https://cmass-sales.web.app.

Why this exists
- Your repo currently serves a static web app under `public/` and there is no native Android project in the repository.
- To produce an APK you need a native wrapper (Cordova/Capacitor/TWA) and an Android build environment (Android SDK, platform tools, Gradle, Java).

Two options to get an APK

A) Build locally (recommended)
1. Install prerequisites on Windows:
   - Java JDK 11+ (you already have Java 17 installed)
   - Android SDK (via Android Studio) and set `ANDROID_HOME` / add `platform-tools` to PATH
   - Node.js and npm
   - Cordova CLI: `npm install -g cordova`
   - (Optionally) Gradle or rely on Cordova's Gradle wrapper

2. From the repo root, create a Cordova project (example):

```powershell
cd mobile
cordova create cmass com.cmass.sales "CMASS 영업일지"
cd cmass
# replace config.xml with the template in ../cordova/config.xml or edit accordingly
cordova platform add android
cordova plugin add cordova-plugin-whitelist
cordova prepare android
cordova build android --release
```

3. After build succeeds, APK is at `platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk` (or debug variant if you built without --release). Sign/align the APK per Android docs.

B) I can attempt to build here if you want me to try, but this environment currently does not have Android SDK/Gradle/adb available.

Notes on `staff` param and pages
- The wrapper's start URL is `https://cmass-sales.web.app/` (see `config.xml` content).
- Your web app already uses `staff` as the canonical query param (I checked `index.html` and `meeting.html` use `staff`).
- If you want the native app to open to a particular staff token by default, you can edit the `<content src="..." />` line in `config.xml` to include `?staff=SongHoonjae` (or dynamically pass it in native code).

If you want, I can:
- (1) Try to build an APK here (I will check for Android SDK and Gradle; currently missing). If you want that, tell me to proceed and I'll attempt to install/prepare (may require interactive setup and large downloads).
- (2) Create a Capacitor-based wrapper instead (modern, recommended) and give clear scripts to build locally.
- (3) Provide fully copy-pasteable step-by-step build commands tailored to your Windows environment.

Which do you want me to do next?
- Reply with `build-here` to let me try an automated build here (may fail due to missing SDK/tools).
- Reply with `scaffold-capacitor` to generate a Capacitor scaffold and scripts to build locally.
- Reply with `instructions-only` to get a concise doc with exact commands to run locally to produce a release-signed APK.