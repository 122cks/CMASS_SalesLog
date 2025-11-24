Write-Host "Searching common locations for JDK installations..."
$roots = @('C:\Program Files','C:\Program Files (x86)', "$env:USERPROFILE", "$env:USERPROFILE\AppData\Local")
$candidates = @()
foreach($r in $roots){
    if(Test-Path $r){
        Write-Host "Scanning $r (may take a few seconds)"
        try{
            $dirs = Get-ChildItem -Path $r -Directory -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'jdk|temurin|adoptium|openjdk|java|zulu' } | Select-Object -First 50
            foreach($d in $dirs){ $candidates += $d.FullName }
        } catch { Write-Host "  scan error: $_" }
    }
}
$candidates = $candidates | Select-Object -Unique
if(-not $candidates){ Write-Host "No candidate JDK directories found."; exit 0 }
Write-Host "Candidate JDK paths:"
foreach($p in $candidates){
    Write-Host " - $p"
}

Write-Host "Checking for java.exe under each candidate..."
foreach($p in $candidates){
    $java = Join-Path $p 'bin\java.exe'
    if(Test-Path $java){
        Write-Host "Has java.exe: $java"
        try{
            & $java -version 2>&1 | ForEach-Object { Write-Host "    $_" }
        } catch { Write-Host "    (couldn't run java.exe: $_)" }
    } else {
        Write-Host "No java.exe under: $p"
    }
}
