Param(
  [string]$Path
)
if (-not $Path) { Write-Error 'Path required'; exit 2 }
$ids = @{}
Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object -Begin{ $i=1 } -Process{
  $line = $_
  if ($line -match 'id\s*=\s*"([^"]+)"'){
    $id = $matches[1]
    if (-not $ids.ContainsKey($id)) { $ids[$id] = @() }
    $ids[$id] += $i
  }
  $i++
}
$dups = $ids.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 }
foreach ($d in $dups) { Write-Output ($d.Key + ': ' + ($d.Value -join ', ')) }
if (-not $dups) { Write-Output 'NO_DUPLICATE_IDS' }
