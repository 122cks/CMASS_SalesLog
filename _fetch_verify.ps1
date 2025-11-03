$url = 'https://cmass-sales.web.app/input'
Write-Output "GET $url"
try {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ 'Cache-Control'='no-cache' } -TimeoutSec 30
  Write-Output ('Status: ' + $r.StatusCode)
  Write-Output ('Content-Type: ' + ($r.Headers['Content-Type'] -as [string]))
  $s = $r.Content
  $has = $s -match 'sales_staff.csv'
  Write-Output ("Contains sales_staff.csv? $has")
  if ($has) {
    $idx = $s.IndexOf('sales_staff.csv')
    $start = [Math]::Max(0, $idx - 80)
    $len = [Math]::Min(200, $s.Length - $start)
    Write-Output 'Snippet around match:'
    Write-Output $s.Substring($start, $len)
  }
} catch {
  Write-Output 'Fetch failed:'
  Write-Output $_.Exception.Message
}
