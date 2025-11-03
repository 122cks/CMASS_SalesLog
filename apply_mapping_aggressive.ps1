$apiBase = 'https://asia-northeast3-cmass-sales.cloudfunctions.net/api'
$entries = @()
$cursor = $null
Write-Host 'Fetching visit_entries pages...'
while ($true) {
    $url = "$apiBase/visits?useEntries=true&pageSize=500"
    if ($cursor) { $url = $url + "&cursor=$([System.Uri]::EscapeDataString($cursor))" }
    $resp = Invoke-RestMethod -Uri $url -Method Get
    if ($resp.rows) { $entries += $resp.rows }
    if (-not $resp.nextCursor) { break }
    $cursor = $resp.nextCursor
}
Write-Host "Total entries fetched: $($entries.Count)"
$missingSchools = $entries | Where-Object { $_.school -and (-not $_.region -or $_.region -eq '') } | Select-Object -ExpandProperty school | ForEach-Object { $_.ToString().Trim() } | Sort-Object -Unique
Write-Host "Distinct schools missing region: $($missingSchools.Count)"

# fetch CSV
Write-Host 'Fetching CSV...'
$csvText = (Invoke-WebRequest -Uri 'https://cmass-sales.web.app/sales_staff.csv' -UseBasicParsing).Content
$csv = $csvText -split "`n" | ConvertFrom-Csv
if (-not $csv -or $csv.Count -eq 0) { Write-Host 'CSV parse failed or empty'; exit 1 }
$cols = $csv[0].psobject.properties.name
$schoolCol = $cols | Where-Object { $_ -match '학교명|학교|school' } | Select-Object -First 1
$regionCol = $cols | Where-Object { $_ -match '지역|region' } | Select-Object -First 1
Write-Host "CSV columns detected: school='$schoolCol' region='$regionCol'"
$csvMap = @{}
foreach ($r in $csv) {
    $sk = ''
    $rv = ''
    try { $sk = ($r.$schoolCol -as [string]).Trim() } catch { $sk = '' }
    try { $rv = ($r.$regionCol -as [string]).Trim() } catch { $rv = '' }
    if ($sk) { $csvMap[$sk] = $rv }
}
Write-Host "CSV map rows: $($csvMap.Keys.Count)"

function Find-Region($school){
    if (-not $school) { return $null }
    # exact
    if ($csvMap.ContainsKey($school)) { return $csvMap[$school] }
    # case-insensitive exact
    $ikey = $csvMap.Keys | Where-Object { $_.ToString().ToLower() -eq $school.ToLower() } | Select-Object -First 1
    if ($ikey) { return $csvMap[$ikey] }
    # substring match (school contains key or key contains school)
    $k = $csvMap.Keys | Where-Object { $school.Contains($_) -or $_.Contains($school) } | Select-Object -First 1
    if ($k) { return $csvMap[$k] }
    # token intersection: split by whitespace and compare
    $stoks = $school -split '\s+' | Where-Object { $_ -ne '' }
    foreach ($ck in $csvMap.Keys) {
        $ctoks = $ck -split '\s+' | Where-Object { $_ -ne '' }
        $inter = $stoks | Where-Object { $ctoks -contains $_ }
        if ($inter -and $inter.Count -ge 1) { return $csvMap[$ck] }
    }
    return $null
}

$finalMap = @{}
$unmapped = @()
foreach ($s in $missingSchools) {
    $reg = Find-Region $s
    if ($reg) { $finalMap[$s] = $reg } else { $unmapped += $s }
}
Write-Host "Mapped $($finalMap.Keys.Count) schools; Unmapped: $($unmapped.Count)"

if ($finalMap.Keys.Count -eq 0) { Write-Host 'No mappings found to apply. Aborting.'; exit 0 }

# Apply mapping via apply_mapping_full
$payload = @{ mapping = $finalMap; dryRun = $false }
Write-Host 'Applying mapping to server (apply_mapping_full)...'
try {
    $resp = Invoke-RestMethod -Uri "$apiBase/visits/apply_mapping_full" -Method Post -Body (ConvertTo-Json $payload -Depth 10) -ContentType 'application/json'
    Write-Host "Server response: $((ConvertTo-Json $resp -Depth 5))"
} catch { Write-Host 'Apply call failed:'; Write-Host $_.Exception.Message; exit 1 }

Write-Host 'Unmapped schools (sample up to 200):'
if ($unmapped.Count -gt 0) { $unmapped[0..([math]::Min(199,$unmapped.Count-1))] | ForEach-Object { Write-Host " - $_" } } else { Write-Host ' - (none)' }

Write-Host 'Done.'
