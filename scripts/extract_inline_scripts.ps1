param(
  [string]$Path = "public\input.html",
  [string]$OutJs = "public\input.inline.js"
)

$full = Resolve-Path $Path
$text = Get-Content -Raw -Encoding UTF8 $full
# Regex to match <script ...>...</script> where there is no src attribute
$regex = [regex]"(?si)<script\b(?![^>]*\bsrc\b)[^>]*>(?<body>.*?)</script>"
$matches = $regex.Matches($text)
$concat = "";
foreach($m in $matches){ $concat += $m.Groups['body'].Value + "`r`n`r`n" }
# Remove those inline scripts from HTML
$new = $regex.Replace($text, '')
# Insert script tag before </body>
 $insertion = '<script src="/input.inline.js" defer></script>' + [Environment]::NewLine
if ($new -match '(?i)</body>'){
  $new = [regex]::Replace($new, '(?i)</body>', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) return $insertion + $m.Value })
} else {
  $new += "`r`n" + $insertion
}
# Write out files
Set-Content -Path $OutJs -Value $concat -Encoding UTF8
Set-Content -Path $Path -Value $new -Encoding UTF8
Write-Output "WROTE_INLINE_JS_CHUNKS: $($matches.Count)"
