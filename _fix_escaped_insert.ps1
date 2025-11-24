$p = 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\sales-input1.html'
$b = Get-Content $p -Raw
$pattern = 'const\\ text\\ =\\ await\\ resp\\.text\\(\\);[\\s\\S]*?if \(!text\) continue;'
$replacement = @'
const text = await resp.text();
          // If the response is HTML (common when the file is missing and
          // the server returns a 404 page), skip it. This prevents parsing
          // HTML as CSV/JS which leads to "Unexpected token '<'" errors.
          const ctype = resp.headers && resp.headers.get ? resp.headers.get('content-type') : '';
          if (ctype && ctype.toLowerCase().includes('text/html')) {
            console.warn('Skipping HTML response for staff CSV candidate:', path, '(content-type:', ctype, ')');
            continue;
          }
          if (text && text.trim().startsWith('<')) {
            console.warn('Skipping HTML-like response for staff CSV candidate:', path);
            continue;
          }
          if (!text) continue;
'@
if ($b -match $pattern) {
  $b = [regex]::Replace($b, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement })
  Set-Content -Path $p -Value $b -Encoding UTF8
  Write-Output 'Fixed escaped insert and wrote file'
} else {
  Write-Output 'Pattern not found; aborting'
}
