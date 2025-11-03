$files = @(
  'https://cmass-sales.web.app/manifest.json',
  'https://cmass-sales.web.app/service-worker.js',
  'https://cmass-sales.web.app/sw.js',
  'https://cmass-sales.web.app/neis_grid.js',
  'https://cmass-sales.web.app/favicon.ico'
)
foreach ($x in $files) {
  try {
    $r = Invoke-WebRequest -Uri $x -UseBasicParsing -Method Head -ErrorAction Stop
    Write-Output ($x + ' -> ' + $r.StatusCode)
  } catch {
    if ($_.Exception.Response) { Write-Output ($x + ' -> ' + $_.Exception.Response.StatusCode) } else { Write-Output ($x + ' -> FAILED: ' + $_.Exception.Message) }
  }
}
