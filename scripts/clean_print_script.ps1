$p = Join-Path $PSScriptRoot 'print_script_with_lines.ps1'
$target = @'
param([int[]]$Indexes)

# Print the contents of inline <script> blocks with line numbers.
# Usage: .\print_script_with_lines.ps1 3    # print script index 3
#        .\print_script_with_lines.ps1   # print all scripts

$path = Join-Path $PSScriptRoot '..\\public\\input.html'
$content = Get-Content -Raw -LiteralPath $path
$allMatches = [regex]::Matches($content, '<script[^>]*>([\\s\\S]*?)</script>', 'IgnoreCase')

if (-not $Indexes) { $Indexes = 0..($allMatches.Count-1) }
foreach ($Index in $Indexes) {
    if ($Index -lt 0 -or $Index -ge $allMatches.Count) { Write-Error "Index out of range: $Index"; continue }
    $script = $allMatches[$Index].Groups[1].Value -split "\\r?\\n"
    $startLine = ( $content.Substring(0, $allMatches[$Index].Index) -split '\\r?\\n').Count
    Write-Output "--- Script[$Index] (start line: $startLine) ---"
    for ($i=0; $i -lt $script.Length; $i++) { $ln = $script[$i]; $num = $i+1; Write-Output ("{0,4}: {1}" -f $num, $ln) }
    Write-Output ""
}
'@

Set-Content -LiteralPath $p -Value $target -Encoding UTF8 -Force
Write-Output "WROTE $p"