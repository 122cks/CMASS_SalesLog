param([int]$startLine=3405,[int]$endLine=3445)
$path = Join-Path $PSScriptRoot '..\public\sales_staff_mapping.json'
$lines = Get-Content -LiteralPath $path -Encoding UTF8
for ($i=$startLine; $i -le $endLine; $i++) {
  if ($i -lt 0 -or $i -ge $lines.Count) { continue }
  $ln = $lines[$i]
  Write-Output ("{0,5}: {1}" -f ($i+1), $ln)
}