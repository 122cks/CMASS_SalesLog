$f='c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\meeting.html'
$p=Get-Content -LiteralPath $f
$balance=0
$changes=@()
for($i=0;$i -lt $p.Count;$i++){
  $l=$p[$i]
  $opens = ($l.ToCharArray() | Where-Object {$_ -eq '{'}).Count
  $closes = ($l.ToCharArray() | Where-Object {$_ -eq '}'}).Count
  $net = $opens - $closes
  $balance += $net
  if($net -ne 0){ $changes += ,@($i+1,$net,$balance,$l.Trim()) }
}
# show last 80 changes
$last = $changes | Select-Object -Last 80
foreach($c in $last){ $ln=$c[0]; $net=$c[1]; $bal=$c[2]; $txt=$c[3]; if($txt.Length -gt 120){ $txt = $txt.Substring(0,120) + '...' } ; Write-Host ("{0,5}: net={1,3} bal={2,4} | {3}" -f $ln,$net,$bal,$txt) }
Write-Host "--- total change events: $($changes.Count) ---"