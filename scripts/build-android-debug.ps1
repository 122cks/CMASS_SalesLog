# Build Android debug APK (Windows PowerShell)
# Build Android debug APK (Windows PowerShell)
param(
  [string]$ProjectDir = $null,
  [string]$Gradlew = "gradlew.bat"
)

# Resolve project directory relative to this script when not provided
if (-not $ProjectDir) {
  # $PSScriptRoot is the directory containing this script
  $ProjectDir = Join-Path -Path $PSScriptRoot -ChildPath "..\android-wrapper"
}

$resolved = Resolve-Path -Path $ProjectDir -ErrorAction SilentlyContinue
if (-not $resolved) {
  Write-Error "android-wrapper folder not found at '$ProjectDir'. Please ensure the repository layout is intact."
  exit 1
}

Push-Location $resolved.Path
if (-not (Test-Path $Gradlew)) {
  Write-Error "Gradle wrapper not found in '$($resolved.Path)'. Create a Gradle wrapper (run 'gradle wrapper' there) or open the project in Android Studio."
  Pop-Location
  exit 1
}
# Clean and build debug APK
& .\$Gradlew clean
& .\$Gradlew assembleDebug
Write-Host "Debug APK should be in app\build\outputs\apk\debug\"
Pop-Location
