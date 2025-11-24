#!/usr/bin/env pwsh
param(
  [string]$Path = 'public/input.html',
  [int]$MinLen = 4,
  [int]$MaxLen = 20
)

# Find duplicate multi-line blocks (useful for deduping pasted HTML)
$lines = Get-Content -LiteralPath $Path -ErrorAction Stop -Encoding UTF8
$seen = @{}
$dups = @{}

for ($len = $MinLen; $len -le $MaxLen; $len++) {
  for ($i = 0; $i -le $lines.Count - $len; $i++) {
    $blockLines = $lines[$i..($i + $len - 1)]
    $block = ($blockLines -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($block)) { continue }
    try {
      $stream = [System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($block))
      $h = (Get-FileHash -InputStream $stream -Algorithm MD5).Hash
      $stream.Dispose()
    } catch {
      $h = $block.GetHashCode().ToString()
    }
    if (-not $seen.ContainsKey($h)) {
      $seen[$h] = @($i + 1)
    } else {
      $seen[$h] += ($i + 1)
      if ($seen[$h].Count -ge 2) {
        # ensure we copy the array into the stored object (leading comma forces array expression)
        $dups[$h] = @{ lines = ,($seen[$h]); len = $len; block = $block }
      }
    }
  }
}

if ($dups.Count -eq 0) { Write-Output 'No duplicates found'; exit 0 }

foreach ($k in $dups.Keys) {
  $v = $dups[$k]
  Write-Output ("--- DUPLICATE BLOCK (len=$($v.len)) at lines: $($v.lines -join ', ') ---")
  Write-Output $v.block
  Write-Output ""
}
#!/usr/bin/env pwsh
param(
  [string]$Path = 'public\input.html',
  [int]$MinLen = 4,
  [int]$MaxLen = 20
)

# Find duplicate multi-line blocks (useful for deduping pasted HTML)
$lines = Get-Content -LiteralPath $Path -ErrorAction Stop -Encoding UTF8
#!/usr/bin/env pwsh
param(
  [string]$Path = 'public\input.html',
  [int]$MinLen = 4,
  [int]$MaxLen = 20
)

# Find duplicate multi-line blocks (useful for deduping pasted HTML)
$lines = Get-Content -LiteralPath $Path -ErrorAction Stop -Encoding UTF8
$seen = @{}
$dups = @{}

for ($len = $MinLen; $len -le $MaxLen; $len++) {
  for ($i = 0; $i -le $lines.Count - $len; $i++) {
    $blockLines = $lines[$i..($i + $len - 1)]
    $block = ($blockLines -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($block)) { continue }
    try {
      $stream = [System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($block))
      $h = (Get-FileHash -InputStream $stream -Algorithm MD5).Hash
      $stream.Dispose()
    } catch {
      $h = $block.GetHashCode().ToString()
    }
    if (-not $seen.ContainsKey($h)) {
      $seen[$h] = @($i + 1)
    } else {
      $seen[$h] += ($i + 1)
      if ($seen[$h].Count -ge 2) {
        # ensure we copy the array into the stored object (leading comma forces array expression)
        $dups[$h] = @{ lines = ,($seen[$h]); len = $len; block = $block }
      }
    }
  }
}

if ($dups.Count -eq 0) { Write-Output 'No duplicates found'; exit 0 }

foreach ($k in $dups.Keys) {
  $v = $dups[$k]
  Write-Output "--- DUPLICATE BLOCK (len=$($v.len)) at lines: $($v.lines -join ', ') ---"
  Write-Output $v.block
  Write-Output ""
}
$dups = @{}
