Param(
  [string]$Path
)
if (-not $Path) { Write-Error 'Path required'; exit 2 }
$inScript = $false
$i = 1
Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
  $line = $_
  $hasOpen = $line -match '<script\b'
  $hasClose = $line -match '</script>'
  if ($hasOpen -and -not $hasClose) { $inScript = $true }
  if ($inScript -and $line -match '<style\b') { Write-Output ($i.ToString() + ': ' + $line) }
  if ($hasClose -and -not $hasOpen) { $inScript = $false }
  $i++
}
