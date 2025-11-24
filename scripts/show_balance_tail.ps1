$f='c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\meeting.html'
$p=Get-Content -LiteralPath $f
$balance=0
for($i=0;$i -lt $p.Count;$i++){
  $l=$p[$i]
  $opens = ($l.ToCharArray() | Where-Object {$_ -eq '{'}).Count
  $closes = ($l.ToCharArray() | Where-Object {$_ -eq '}'}).Count
  $balance += $opens - $closes
  $lineNum = $i+1
  if($lineNum -ge ($p.Count-200)){
    $preview = $l.Trim()
    if($preview.Length -gt 120){ $preview = $preview.Substring(0,120) + '...'}
    Write-Host ("{0,5}: bal={1,4} | {2}" -f $lineNum, $balance, $preview)
  }
}
Write-Host "--- final balance: $balance (opens - closes) ---"