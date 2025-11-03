param(
  [string]$Path = "public\input.html",
  [int]$MinLen = 6,
  [int]$MaxLen = 12
)

if (-not (Test-Path $Path)) { Write-Error "Path not found: $Path"; exit 2 }

$orig = Get-Content -Path $Path -Encoding UTF8
$lineCount = $orig.Count
Write-Output "Read $lineCount lines from $Path"

# Build a map of hashes to first occurrence index
$first = @{}
$duplicates = @()
$deletedRanges = @()

# Helper: compute MD5 hash of a string
function Get-MD5([string]$s){
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
  $ms = New-Object System.IO.MemoryStream(,$bytes)
  $h = Get-FileHash -InputStream $ms -Algorithm MD5
  return $h.Hash
}

# We'll scan lengths from MaxLen down to MinLen (longer blocks first)
for ($len = $MaxLen; $len -ge $MinLen; $len--) {
  Write-Output "Scanning blocks of length $len..."
  for ($i = 0; $i -le $lineCount - $len; $i++){
    # if this range overlaps an already-deleted range, skip
    $rangeStart = $i+1; $rangeEnd = $i+$len
    $overlap = $false
    foreach($r in $deletedRanges){ if(-not ($rangeEnd -lt $r.start -or $rangeStart -gt $r.end)) { $overlap = $true; break } }
    if ($overlap) { continue }

    $blockLines = $orig[$i..($i+$len-1)]
    $block = ($blockLines -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($block)) { continue }
    $h = Get-MD5 $block
    if (-not $first.ContainsKey($h)) { $first[$h] = $i+1 }
    elseif ($first[$h] -lt ($i+1)) {
      # mark this range for deletion
      $duplicates += @{start=($i+1); end=($i+$len); len=$len; hash=$h}
      $deletedRanges += @{start=($i+1); end=($i+$len)}
    }
  }
}

if ($duplicates.Count -eq 0) { Write-Output "No duplicates found to remove."; exit 0 }

# Sort duplicates by start index descending so we can remove lines safely
$duplicatesSorted = $duplicates | Sort-Object -Property start -Descending

# Backup original
$bak = "$Path.bak"
Copy-Item -Path $Path -Destination $bak -Force
Write-Output "Backup written to $bak"

# Remove duplicates from content
$lines = [System.Collections.Generic.List[string]]::new()
foreach ($l in $orig) { $lines.Add([string]$l) }

$removed = 0
foreach ($d in $duplicatesSorted){
  $s = $d.start; $e = $d.end; $count = $e - $s + 1
  if ($s -le 0 -or $e -gt $lines.Count) { continue }
  # remove range (1-based indices)
  $idx = $s - 1
  for ($k=0;$k -lt $count;$k++){ $lines.RemoveAt($idx) }
  $removed += $count
  Write-Output "Removed lines $s-$e (len=$($d.len))"
}

# Write back
$lines | Out-File -FilePath $Path -Encoding UTF8 -Force
Write-Output "Wrote deduped file. Removed total $removed lines in $($duplicates.Count) duplicate blocks."
Write-Output "Backup at: $bak"
