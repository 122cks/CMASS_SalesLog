$u1='https://cmass-sales.web.app/input'
$u2='https://cmass-sales.web.app/input1'
Write-Output ("Checking $u1 and $u2")
try {
  $r1 = Invoke-WebRequest -Uri $u1 -UseBasicParsing -Headers @{ 'Cache-Control'='no-cache' } -TimeoutSec 30
} catch { $r1 = $_.Exception.Response }
try {
  $r2 = Invoke-WebRequest -Uri $u2 -UseBasicParsing -Headers @{ 'Cache-Control'='no-cache' } -TimeoutSec 30
} catch { $r2 = $_.Exception.Response }

function summarize($r, $label){
  if (-not $r) { Write-Output ($label + ': no response'); return }
  $status = $null
  $ct = $null
  $len = $null
  try { $status = $r.StatusCode } catch {}
  try { $ct = $r.Headers['Content-Type'] -as [string] } catch {}
  try { $len = ($r.Content).Length } catch {}
  Write-Output ($label + ': status=' + ($status -as [string]) + ' content-type=' + ($ct -as [string]) + ' length=' + ($len -as [string]))
}

summarize $r1 'input'
summarize $r2 'input1'

# If both returned HTML contents, compare a small snippet
try {
  if ($r1 -and $r2 -and $r1.Content -and $r2.Content) {
    $same = $r1.Content -eq $r2.Content
    Write-Output ('Contents identical? ' + ($same -as [string]))
    if (-not $same) {
  Write-Output "Snippet from /input around 'sales_staff.csv':"
      $i = $r1.Content.IndexOf('sales_staff.csv')
      if ($i -ge 0) { Write-Output $r1.Content.Substring([Math]::Max(0,$i-60), [Math]::Min(140,$r1.Content.Length-$i+60)) }
    }
  }
} catch { Write-Output 'Comparison failed: ' + $_.Exception.Message }
