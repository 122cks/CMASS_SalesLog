param([string]$SchoolName = '과천고등학교')
Set-Location -Path $PSScriptRoot\..\public
$all = Get-Content -Path 'sales_staff.csv' -Encoding UTF8
$header = $all | Select-Object -First 1
Write-Output 'HEADER:'
Write-Output $header
Write-Output '----'
$rows = $all | Select-Object -Skip 1
$matches = $rows | Where-Object { $_ -like "*${SchoolName}*" }
Write-Output "MATCH LINES (count: $($matches.Count)):'"
$matches | ForEach-Object { Write-Output $_ }
