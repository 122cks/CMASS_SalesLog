# checks common Android SDK locations and prints contents
Write-Host "Detecting Android SDK locations..."
Write-Host "Environment variables:"
Write-Host "  LOCALAPPDATA=$env:LOCALAPPDATA"
Write-Host "  USERPROFILE=$env:USERPROFILE"
Write-Host "  ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "  ANDROID_SDK_ROOT=$env:ANDROID_SDK_ROOT"

$paths = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "$env:USERPROFILE\AppData\Local\Android\Sdk",
    'C:\Android\sdk',
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT
) | Where-Object { $_ -and $_ -ne '' } | Select-Object -Unique

if(-not $paths) {
    Write-Host "No candidate paths to check."
    exit 0
}

foreach($p in $paths) {
    if(Test-Path $p) {
        Write-Host "FOUND: $p"
        try {
            Get-ChildItem -Path $p -Name | ForEach-Object { Write-Host "  $_" }
        } catch {
            Write-Host "  (couldn't list contents: $_)"
        }
    } else {
        Write-Host "Not found: $p"
    }
}
