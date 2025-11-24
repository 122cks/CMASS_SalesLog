$f='c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\meeting.html'
$p=Get-Content -LiteralPath $f
$balance=0
$neg=@()
for($i=0;$i -lt $p.Count;$i++){
  $l=$p[$i]
  $opens = ($l.ToCharArray() | Where-Object {$_ -eq '{'}).Count
  $closes = ($l.ToCharArray() | Where-Object {$_ -eq '}'}).Count
  $balance += $opens - $closes
  if($balance -lt 0){ $neg += ($i+1); $balance=0 }
}
$all = $p -join "`n"
$totalOpens = ($all.ToCharArray() | Where-Object {$_ -eq '{'}).Count
$totalCloses = ($all.ToCharArray() | Where-Object {$_ -eq '}'}).Count
Write-Host "total opens: $totalOpens, total closes: $totalCloses"
if($neg.Count -gt 0){ Write-Host "negative-balance lines: " ($neg -join ', ') } else { Write-Host 'no negative-balance lines detected' }
Write-Host "final balance (opens - closes): " ($totalOpens - $totalCloses)
