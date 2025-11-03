param(
  [string]$GradleVersion = '8.5',
  [string]$ProjectDir = "..\android-wrapper"
)

function Write-ErrAndExit($msg){
  Write-Error $msg
  exit 1
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Resolve-Path -Path (Join-Path $scriptRoot $ProjectDir) -ErrorAction SilentlyContinue
if (-not $projectPath) { Write-ErrAndExit "android-wrapper folder not found at '$ProjectDir'" }

$tmp = Join-Path $env:TEMP ("gradle_bootstrap_{0}" -f ([System.Guid]::NewGuid().ToString()))
New-Item -ItemType Directory -Path $tmp | Out-Null

$zipUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
$zipPath = Join-Path $tmp "gradle.zip"

Write-Host "Downloading Gradle $GradleVersion from $zipUrl ..."
try {
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
} catch {
  Write-ErrAndExit "Failed to download Gradle distribution: $_"
}

Write-Host "Extracting..."
try {
  Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
} catch {
  Write-ErrAndExit "Failed to extract Gradle archive: $_"
}

$extracted = Get-ChildItem -Path $tmp -Directory | Where-Object { $_.Name -like 'gradle-*' } | Select-Object -First 1
if (-not $extracted) { Write-ErrAndExit "Could not find extracted Gradle folder in $tmp" }

$gradleBin = Join-Path $extracted.FullName 'bin\gradle.bat'
if (-not (Test-Path $gradleBin)) { Write-ErrAndExit "gradle executable not found in extracted distribution: $gradleBin" }

Write-Host "Generating Gradle wrapper inside project: $($projectPath.Path)"
# Run the extracted gradle to create a wrapper in the target project
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $gradleBin
$startInfo.Arguments = "wrapper --gradle-version $GradleVersion"
$startInfo.WorkingDirectory = $projectPath.Path
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.UseShellExecute = $false

$p = New-Object System.Diagnostics.Process
$p.StartInfo = $startInfo
if (-not $p.Start()) { Write-ErrAndExit 'Failed to start gradle process' }
$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit()

Write-Host $stdout
if ($p.ExitCode -ne 0) {
  Write-ErrAndExit "Gradle wrapper generation failed with exit code $($p.ExitCode): $stderr"
}

Write-Host "Gradle wrapper generated. Cleaning up temporary files..."
Remove-Item -Recurse -Force $tmp

Write-Host "Done. You should now have .\android-wrapper\gradlew(.bat) and gradle/wrapper/ files in the project."
