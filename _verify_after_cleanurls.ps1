$url = 'https://cmass-sales.web.app/input'
Write-Output "GET $url"
try {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ 'Cache-Control'='no-cache' } -TimeoutSec 30
  Write-Output ('Status: ' + $r.StatusCode)
  Write-Output ('Content-Type: ' + ($r.Headers['Content-Type'] -as [string]))
  $s = $r.Content
  Write-Output ('Contains sales_staff.csv? ' + ($s -match 'sales_staff.csv'))
} catch {
  Write-Output 'Fetch failed: ' + $_.Exception.Message
}
