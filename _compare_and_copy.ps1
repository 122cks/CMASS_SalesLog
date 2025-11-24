$src = Join-Path $PSScriptRoot 'public\sales-input1.html'
$dst = Join-Path $PSScriptRoot 'public\sales-input.html'
if (-not (Test-Path $src)) { Write-Output "MISSING SRC: $src"; exit 2 }
if (-not (Test-Path $dst)) { Write-Output "MISSING DST: $dst (will create)" }
$sa = Get-Content -LiteralPath $src -Raw
$sb = if (Test-Path $dst) { Get-Content -LiteralPath $dst -Raw } else { '' }
if ($sa -eq $sb) {
  Write-Output 'IDENTICAL - no copy needed'
  exit 0
} else {
  $bak = $dst + '.' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.bak'
  if (Test-Path $dst) { Copy-Item -LiteralPath $dst -Destination $bak -Force; Write-Output "Backed up existing dst to: $bak" }
  Copy-Item -LiteralPath $src -Destination $dst -Force
  Write-Output "Copied $src -> $dst"
  exit 0
}
