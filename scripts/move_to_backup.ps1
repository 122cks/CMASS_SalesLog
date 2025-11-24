
$root = 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog'
$backup = 'C:\Users\PC\OneDrive\cmass-sales-system\251108_backup'

# Ensure backup dir exists
New-Item -ItemType Directory -Path $backup -Force | Out-Null

$dirNames = '__pycache__', '.pytest_cache', 'playwright-artifacts', 'playwright-report'
foreach ($d in $dirNames) {
    Write-Output "Searching for directories named: $d"
    $found = Get-ChildItem -Path $root -Recurse -Force -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $d }
    foreach ($dir in $found) {
        try {
            $rel = $dir.FullName.Substring($root.Length).TrimStart('\')
            $targetParent = Join-Path $backup (Split-Path $rel -Parent)
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
            Move-Item -LiteralPath $dir.FullName -Destination $targetParent -Force -ErrorAction Stop
            Write-Output "MOVED DIR: $($dir.FullName) -> $targetParent"
        } catch {
            Write-Output "FAILED DIR: $($dir.FullName) -> $($_.Exception.Message)"
        }
    }
}

$filePatterns = 'patch_result_*.json','*.bak','*.tmp','*.log'
foreach ($p in $filePatterns) {
    Write-Output "Searching for files: $p"
    $foundFiles = Get-ChildItem -Path $root -Recurse -Force -File -Include $p -ErrorAction SilentlyContinue
    foreach ($f in $foundFiles) {
        try {
            $rel = $f.FullName.Substring($root.Length).TrimStart('\')
            $destDir = Join-Path $backup (Split-Path $rel -Parent)
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            Move-Item -LiteralPath $f.FullName -Destination $destDir -Force -ErrorAction Stop
            Write-Output "MOVED FILE: $($f.FullName) -> $destDir"
        } catch {
            Write-Output "FAILED FILE: $($f.FullName) -> $($_.Exception.Message)"
        }
    }
}

Write-Output '--- BACKUP CONTENTS (first 200 entries) ---'
Get-ChildItem -Path $backup -Recurse -Force | Select-Object -First 200 | ForEach-Object { Write-Output $_.FullName }

Write-Output '--- DONE ---'
