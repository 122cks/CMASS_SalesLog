param([string]$path, [int]$n=10)
$lines = Get-Content -LiteralPath $path -Encoding UTF8
for ($i=0; $i -lt [Math]::Min($n, $lines.Count); $i++) { Write-Output $lines[$i] }