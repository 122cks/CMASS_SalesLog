Param(
  [string]$Path
)
if (-not $Path) { Write-Error 'Path required'; exit 2 }
$inScript = $false
$i = 1
Get-Content -Encoding UTF8 -LiteralPath $Path | ForEach-Object {
  $line = $_
  $hasOpen = $line -match '<script\b'
  $hasClose = $line -match '</script>'
  if ($hasOpen -and -not $hasClose) { $inScript = $true }
  if (-not $inScript) {
    if ($line -match '\b(function|const|let|var|async|await)\b' -or $line -match '=>') {
      Write-Output ($i + ': ' + $line)
    }
  }
  if ($hasClose -and -not $hasOpen) { $inScript = $false }
  $i++
}
