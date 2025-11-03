param([string]$Path = "public\input.html")
$lines = Get-Content -LiteralPath $Path -ErrorAction Stop
$opens = @(); $closes = @();
for ($i=0; $i -lt $lines.Length; $i++){
    if ($lines[$i] -match '<script\b') { $opens += $i+1 }
    if ($lines[$i] -match '</script>') { $closes += $i+1 }
}
Write-Output "SCRIPT OPENS:"; $opens | ForEach-Object { Write-Output "  $_" }
Write-Output "SCRIPT CLOSES:"; $closes | ForEach-Object { Write-Output "  $_" }
Write-Output "TOTAL LINES: $($lines.Length)"

# Also print ranges of script blocks (open->closest following close)
$ci = 0
foreach ($o in $opens) {
    $start = $o
    $end = ($closes | Where-Object { $_ -gt $o } | Select-Object -First 1)
    if (-not $end) { $end = 'EOF' }
    Write-Output "BLOCK start:$start end:$end"
}
