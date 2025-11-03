$p = 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\sales-input1.html'
$bak = $p + '.bak'
Copy-Item $p $bak -Force
Write-Output "Backup created: $bak"
$b = Get-Content $p -Raw
$old1pattern = 'const candidates = \[[\s\S]*?\];\s*for \(const path of candidates\) \{'
$newCandidates = @'
      // Prefer the canonical underscore filename first, then fall back to
      // legacy/hyphenated and public/data paths. This makes the hosted
      // site use `sales_staff.csv` when present.
      const candidates = [
        'sales_staff.csv',
        'public/sales_staff.csv',
        'data/sales_staff.csv',
        'sales-staff.deployed.csv',
        'sales-staff.csv',
        'data/sales-staff.csv',
        'public/sales-staff.deployed.csv',
        'public/sales-staff.csv'
      ];

      for (const path of candidates) {
'@
if ($b -match $old1pattern) {
  $b = [regex]::Replace($b, $old1pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $newCandidates })
  Write-Output 'Replaced candidates block'
} else {
  Write-Output 'Candidates block pattern not found'
}
$old2pattern = 'const text = await resp.text\(\);'
$insert = @'
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
'@
if ($b -match $old2pattern) {
  $b = $b -replace $old2pattern, [regex]::Escape($insert)
  Write-Output 'Inserted HTML-skip check after resp.text()'
} else {
  Write-Output 'resp.text() pattern not found'
}
Set-Content -Path $p -Value $b -Encoding UTF8
Write-Output 'Wrote file'
