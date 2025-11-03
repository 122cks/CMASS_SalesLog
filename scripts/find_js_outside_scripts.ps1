param([string]$Path = "public\input.html")
$lines = Get-Content -LiteralPath $Path -ErrorAction Stop
$insideScript = $false
$insideStyle = $false
for ($i=0; $i -lt $lines.Length; $i++){
    $ln = $lines[$i]
    if ($ln -match '<script\b') { $insideScript = $true }
    if ($ln -match '<style\b') { $insideStyle = $true }
    if (-not $insideScript -and -not $insideStyle) {
        if ($ln -match '\b(function|const|let|var|try|return|=>|catch)\b' -or $ln -match '^[\s]*[\}\{][\s]*$'){
            Write-Output "OUTSIDE JS-LIKE at line $($i+1): $ln"
            $start = [math]::Max(0, $i-2)
            $end = [math]::Min($lines.Length-1, $i+2)
            for ($j=$start; $j -le $end; $j++){ Write-Output "  $($j+1): $($lines[$j])" }
            Write-Output "---"
        }
    }
    if ($ln -match '</script>') { $insideScript = $false }
    if ($ln -match '</style>') { $insideStyle = $false }
}
