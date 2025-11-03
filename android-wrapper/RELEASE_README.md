Release signing and upload instructions

1) Prepare keystore (if you don't have one)

Generate a new keystore (run on your dev machine):

keytool -genkey -v -keystore my-release-key.jks -alias cmasskey -keyalg RSA -keysize 2048 -validity 10000

2) Create keystore.properties

Copy the provided template and fill values (do NOT commit this file to source control):

cp keystore.properties.template keystore.properties
# edit keystore.properties and set correct paths/passwords

3) Build signed release with Gradle

From project root run (Windows PowerShell):

cd android-wrapper
./gradlew.bat assembleRelease -PRELEASE_STORE_FILE="C:\path\to\my-release-key.jks" -PRELEASE_STORE_PASSWORD="<storepw>" -PRELEASE_KEY_ALIAS="cmasskey" -PRELEASE_KEY_PASSWORD="<keypw>"

Or set properties in android-wrapper/keystore.properties and then run:

./gradlew.bat assembleRelease

4) Artifact locations

Unsigned APK: app/build/outputs/apk/release/app-release-unsigned.apk
Signed APK (if signing configured): app/build/outputs/apk/release/app-release.apk
AAB: app/build/outputs/bundle/release/app-release.aab

5) Zipalign / verify (if signing manually)

# zipalign (Android SDK build-tools required)
zipalign -v -p 4 app-release-unsigned.apk app-release-signed.apk
apksigner verify --print-certs app-release-signed.apk

6) Upload to Play Console

Use the Play Console to upload the AAB or signed APK. For app signing by Google Play, upload an AAB and follow Play Signing instructions.

Security note: Never commit keystore files or passwords to source control. Keep them safe and back them up offline.
