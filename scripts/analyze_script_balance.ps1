param([int]$Index)
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
if ($Index -lt 0 -or $Index -ge $matches.Count) { Write-Error "Index out of range: $Index (count=$($matches.Count))"; exit 1 }
$script = $matches[$Index].Groups[1].Value -split "\r?\n"
$cumul = 0
for ($i=0; $i -lt $script.Length; $i++){
  $line = $script[$i]
  $opens = ($line -split "\{").Count -1
  $closes = ($line -split "\}").Count -1
  $cumul += ($opens - $closes)
  Write-Output ("{0,4}: {1}  (opens={2}, closes={3}, cumul={4})" -f ($i+1), $line, $opens, $closes, $cumul)
}
Write-Output "Final cumul: $cumul"
