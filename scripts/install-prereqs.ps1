<#
Installs prerequisites for building the Android wrapper on Windows.
Run as Administrator from repository root:

  Start-Process powershell -Verb runAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File .\scripts\install-prereqs.ps1'

What this script does (best-effort):
- Download & silently install Temurin (OpenJDK) 17 MSI
- Download Android platform-tools and extract to a folder and add to PATH
- Attempt to install ImageMagick via winget if available

This script requires internet access and admin rights.
#>

param(
  [string]$JavaVersion = '17',
  [string]$TempDir = "$env:TEMP\cmass_prereqs"
)

function Ensure-Admin {
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object System.Security.Principal.WindowsPrincipal($id)
  if (-not $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Start PowerShell as Administrator and run the script."
    exit 1
  }
}

Ensure-Admin

New-Item -Path $TempDir -ItemType Directory -Force | Out-Null

Write-Host "[1/3] Installing Temurin (OpenJDK) $JavaVersion..."
$msiUrl = "https://github.com/adoptium/temurin${JavaVersion}-binaries/releases/latest/download/OpenJDK${JavaVersion}U-jdk_x64_windows_hotspot_latest.msi"
$msiPath = Join-Path $TempDir "temurin${JavaVersion}.msi"
try {
  Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing -ErrorAction Stop
  Start-Process msiexec.exe -ArgumentList '/i', $msiPath, '/qn', '/norestart' -Wait -NoNewWindow
  Write-Host "Temurin $JavaVersion installation finished."
} catch {
  Write-Warning "Temurin download/install failed: $_. You can install Java manually and re-run the build steps."
}

Write-Host "Setting JAVA_HOME (attempt)..."
$possible = Get-ChildItem 'C:\Program Files\*' -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Adoptium|Eclipse Adoptium|Temurin|OpenJDK|Zulu' }
if ($possible) {
  $javaDir = (Get-ChildItem 'C:\Program Files' -Directory | Where-Object { $_.Name -match 'Adoptium|Eclipse Adoptium|Temurin|OpenJDK|Zulu' } | Select-Object -First 1).FullName
  # look for jdk- folder inside
  $jdk = Get-ChildItem $javaDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'jdk' } | Select-Object -First 1
  if ($jdk) {
    $javaHome = $jdk.FullName
    setx JAVA_HOME $javaHome /M | Out-Null
    $env:JAVA_HOME = $javaHome
    Write-Host "JAVA_HOME set to: $javaHome"
  } else {
    Write-Warning "Could not automatically determine JAVA_HOME. Please set JAVA_HOME to your JDK path manually."
  }
} else {
  Write-Warning "No JDK folder found under C:\Program Files. If installation succeeded, set JAVA_HOME manually."
}

Write-Host "[2/3] Installing Android platform-tools (adb)..."
$ptUrl = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip'
$ptZip = Join-Path $TempDir 'platform-tools.zip'
$outDir = 'C:\Android\platform-tools'
try {
  Invoke-WebRequest -Uri $ptUrl -OutFile $ptZip -UseBasicParsing -ErrorAction Stop
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ptZip, $outDir)
  Write-Host "Platform-tools extracted to $outDir"
  # add to PATH for current session and persist
  $current = [Environment]::GetEnvironmentVariable('PATH', [EnvironmentVariableTarget]::Machine)
  if ($current -notlike "*$outDir*") {
    setx PATH ("$current;$outDir") /M | Out-Null
    Write-Host "Added platform-tools to system PATH. You may need to re-open your shell."
  }
} catch {
  Write-Warning "Failed to download or extract platform-tools: $_"
}

Write-Host "[3/3] Installing ImageMagick (attempt via winget)..."
if (Get-Command winget -ErrorAction SilentlyContinue) {
  try {
    winget install --id ImageMagick.ImageMagick -e --accept-package-agreements --accept-source-agreements
    Write-Host "ImageMagick installed via winget. Ensure 'magick' is in PATH."
  } catch {
    Write-Warning "winget install of ImageMagick failed: $_. Install ImageMagick manually from https://imagemagick.org"
  }
} else {
  Write-Warning "winget not found; please install ImageMagick manually if you want the icon generation script to work."
}

Write-Host "Cleanup temporary files..."
try { Remove-Item -Path $TempDir -Recurse -Force } catch {}

Write-Host "Done. Please restart your PowerShell session (or log out/in) so PATH/JAVA_HOME changes take effect. Then run build scripts:"
Write-Host "  .\scripts\generate-mipmap-icons.ps1 -Source .\assets\icon-source.png"
Write-Host "  .\scripts\init-gradle-wrapper.ps1"
Write-Host "  .\scripts\build-android-debug.ps1"
