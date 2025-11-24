Param(
  [string]$RepoRoot = (Get-Item -Path ".").FullName,
  [string]$DryRunFile = "tools\qa\artifacts\prune_dryrun.txt",
  [string]$BackupRoot = "C:\Users\PC\OneDrive\cmass-sales-system\251105_backup",
  [string]$LogFile = "tools\qa\artifacts\prune_move_log.txt"
)

if (-not (Test-Path $DryRunFile)) { Write-Output "Dry-run file not found: $DryRunFile"; exit 1 }

$lines = Get-Content $DryRunFile | Where-Object { $_ -and -not ($_ -match '^COUNT:') } | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if (-not $lines){ Write-Output "No candidate files found in $DryRunFile"; exit 0 }

# Ensure log dir
$logDir = Split-Path $LogFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# Create backup root
if (-not (Test-Path $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null }

$mvCount = 0
$errors = @()
"PRUNE MOVE LOG - $(Get-Date -Format o)" | Out-File $LogFile -Encoding utf8
"RepoRoot: $RepoRoot" | Out-File $LogFile -Append -Encoding utf8
"BackupRoot: $BackupRoot" | Out-File $LogFile -Append -Encoding utf8
"" | Out-File $LogFile -Append -Encoding utf8

foreach ($rel in $lines){
  try{
    # support absolute paths in dry-run file or relative paths
    if ([System.IO.Path]::IsPathRooted($rel)) { 
      $src = $rel
      # if absolute path is inside repo root, compute relative path from repo
      if ($src.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)){
        $relPath = $src.Substring($RepoRoot.Length).TrimStart('\','/')
      } else {
        # fallback: use the file name under backup root
        $relPath = Split-Path $src -Leaf
      }
    } else { 
      $src = Join-Path $RepoRoot $rel 
      $relPath = $rel
    }
    if (-not (Test-Path $src)) { "MISSING: $rel (resolved: $src)" | Out-File $LogFile -Append -Encoding utf8; continue }
    # Destination preserves relative path within backup
    $dest = Join-Path $BackupRoot $relPath
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Move-Item -Path $src -Destination $dest -Force
    "MOVED: $rel -> $dest" | Out-File $LogFile -Append -Encoding utf8
    $mvCount++
  }catch{
    $msg = "ERROR moving $rel : $($_.Exception.Message)"
    $errors += $msg
    $msg | Out-File $LogFile -Append -Encoding utf8
  }
}

"" | Out-File $LogFile -Append -Encoding utf8
"TOTAL_MOVED: $mvCount" | Out-File $LogFile -Append -Encoding utf8
if ($errors.Count -gt 0){ "ERRORS:" | Out-File $LogFile -Append -Encoding utf8; $errors | Out-File $LogFile -Append -Encoding utf8 }

Write-Output "Move complete. Moved: $mvCount files. Log: $LogFile"
