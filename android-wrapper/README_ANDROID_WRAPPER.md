Android wrapper (WebView) quick start

This is a minimal Android project that wraps the hosted webapp URL in a WebView for easy sideloading.

Requirements:
- Android Studio (recommended) or command-line Android SDK + Gradle
- Java JDK

How to build (Android Studio):
1. Open this folder (`android-wrapper`) in Android Studio
2. Let Gradle sync / install SDK components
3. Run -> Build APK(s) -> Build
4. Install the generated APK on devices via USB or distribute internally

How to build (command line):
1. Ensure Android SDK and JAVA_HOME are set
2. From `android-wrapper` folder run:
   ./gradlew assembleDebug    # produces debug APK
   ./gradlew assembleRelease  # produces release APK (unsigned unless signing config is added)

If you don't have a Gradle wrapper yet, either open the project in Android Studio or, if you have Gradle installed system-wide, run from PowerShell in the `android-wrapper` folder:

```powershell
# generate a proper gradle wrapper (requires gradle on PATH)
gradle wrapper

# then build debug
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

Or from the repository root you can use the provided convenience script (PowerShell):

```powershell
# run from repository root
.\scripts\build-android-debug.ps1
```

Notes:
- This wrapper uses a WebView and loads the hosted URL directly. It does not require assetlinks/fingerprints.
- For production or Play Store distribution, consider using TWA (Trusted Web Activity) instead.

Change the loaded URL
---------------------
To change which web page the app loads, edit `MainActivity.kt` and modify the `webView.loadUrl(...)` line. By default it points to:

```
https://cmass-sales.web.app/input.html
```

If you want the WebView to load a local file bundled inside the APK, you'll need to add the file to `assets/` and load with `webView.loadUrl("file:///android_asset/yourfile.html")`.

Launcher icon (use provided attachment)
-------------------------------------
1. Save the attached icon image to the repo, e.g. `assets/icon-source.png` (the attachment you uploaded).
2. Run the helper script from repository root to generate mipmap icons (requires ImageMagick `magick`):

```powershell
.\scripts\generate-mipmap-icons.ps1 -Source .\assets\icon-source.png
```

3. Open `android-wrapper` in Android Studio and build; the generated icons at `app/src/main/res/mipmap-*` will be used as the launcher icon.


