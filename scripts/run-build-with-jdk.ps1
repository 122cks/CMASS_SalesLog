# Set JAVA_HOME for this session to the extracted Temurin JDK and run the Android build script
$jdk = 'C:\Users\PC\cmass_prereqs\jdk-17.0.16+8'
if(-not (Test-Path $jdk)){
    Write-Error "JDK not found at $jdk. Update the path inside this script or install JDK 17."
    exit 1
}
$env:JAVA_HOME = $jdk
$env:Path = "$env:JAVA_HOME\bin;" + $env:Path
Write-Output "Using JAVA_HOME=$env:JAVA_HOME"
Write-Output "java -version:"
java -version 2>&1 | ForEach-Object { Write-Output "  $_" }

# Run the existing build script which calls gradlew
& .\scripts\build-android-debug.ps1
