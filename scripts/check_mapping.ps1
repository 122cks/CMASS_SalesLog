param(
  [string]$Staff = '송훈재',
  [string]$Region = '경기도과천시',
  [string]$School = '과천고등학교'
)

$csvPath = 'C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\sales_staff.csv'

if (-not (Test-Path $csvPath)) { Write-Error "CSV not found: $csvPath"; exit 1 }
$csv = Import-Csv -Path $csvPath

# Helper: find a column name that matches any of the provided regex alternatives
function Find-Header($alternatives){
  $names = $csv | Select-Object -First 1 | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
  foreach ($alt in $alternatives){
    $m = $names | Where-Object { $_ -match $alt }
    if ($m) { return $m[0] }
  }
  return $null
}

$staffHeader = Find-Header -alternatives @('담당자','^staff$','name','이름')
$regionHeader = Find-Header -alternatives @('지역','^region$','sido','area')
$schoolHeader = Find-Header -alternatives @('학교명','학교','^school$','schoolName')

# Additional possible staff header used in CSV: '특성화고 담당자'
$specialStaffHeader = Find-Header -alternatives @('특성화고 담당자','특성화고 담당자','^specialStaff$')

# Print detected header names and which ones were selected
$allNames = ($csv | Select-Object -First 1 | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name) -join ', '
Write-Output "Detected headers: $allNames"
Write-Output "Primary staff header: $staffHeader"
Write-Output "Region header: $regionHeader"
Write-Output "School header: $schoolHeader"
Write-Output "Special staff header: $specialStaffHeader"

# If detection returned odd short values, fall back to common English/Korean names when present
if (-not $staffHeader -or $staffHeader.Length -lt 2) {
  if ($allNames -match '\bstaff\b') { $staffHeader = 'staff' }
  elseif ($allNames -match '담당자') { $staffHeader = ($allNames -split ', ' | Where-Object { $_ -match '담당자' })[0] }
}
if (-not $regionHeader -or $regionHeader.Length -lt 2) {
  if ($allNames -match '\bregion\b') { $regionHeader = 'region' }
  elseif ($allNames -match '지역') { $regionHeader = ($allNames -split ', ' | Where-Object { $_ -match '지역' })[0] }
}
if (-not $schoolHeader -or $schoolHeader.Length -lt 2) {
  if ($allNames -match '\bschool\b') { $schoolHeader = 'school' }
  elseif ($allNames -match '학교') { $schoolHeader = ($allNames -split ', ' | Where-Object { $_ -match '학교' })[0] }
}

# Prefer explicit 'school' column if present (it contains the school name)
if ($allNames -match '\bschool\b') { $schoolHeader = 'school' }

Write-Output "Using headers -> staff: $staffHeader  region: $regionHeader  school: $schoolHeader"

# Show first 5 rows (full) for quick inspection
Write-Output "\nSample rows (first 5):"
($csv | Select-Object -First 5) | ForEach-Object {
  Write-Output "---- ROW ----"
  $_.PSObject.Properties | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Name, ($_.Value -replace '[\r\n]+',' ')) }
}

# Find matches
$foundMatches = $csv | Where-Object {
  # Read values defensively and normalize
  $sRaw = ($_.$staffHeader -as [string]) -replace '[\r\n]+',' '
  $sAltRaw = $null
  if ($specialStaffHeader) { $sAltRaw = ($_.$specialStaffHeader -as [string]) -replace '[\r\n]+',' ' }
  $rRaw = ($_.$regionHeader -as [string]) -replace '[\r\n]+',' '
  $scRaw = ($_.$schoolHeader -as [string]) -replace '[\r\n]+',' '

  # Cast to [string] before Trim() for compatibility with Windows PowerShell (no '??' operator)
  $s = ([string]$sRaw).Trim()
  $sAlt = ([string]$sAltRaw).Trim()
  $r = ([string]$rRaw).Trim()
  $sc = ([string]$scRaw).Trim()

  # normalize common titles from staff field
  $sNorm = $s -replace '\s*(부장|차장|과장|팀장|대리|사원|선생님|선생)\s*$',''
  $sAltNorm = $sAlt -replace '\s*(부장|차장|과장|팀장|대리|사원|선생님|선생)\s*$',''

  # Matching: allow exact or contains; case-insensitive
  $staffMatch = $false
  if ($s) { if ($s -imatch [regex]::Escape($Staff) -or $sNorm -imatch [regex]::Escape($Staff)) { $staffMatch = $true } }
  if (-not $staffMatch -and $sAlt) { if ($sAlt -imatch [regex]::Escape($Staff) -or $sAltNorm -imatch [regex]::Escape($Staff)) { $staffMatch = $true } }

  $regionMatch = ($r -and ($r -ieq $Region -or $r -like "*$Region*"))
  $schoolMatch = ($sc -and ($sc -ieq $School -or $sc -like "*$School*"))

  $staffMatch -and $regionMatch -and $schoolMatch
}

# If no matches found, exit
if (-not $foundMatches -or $foundMatches.Count -eq 0) { Write-Output 'NO_MATCH'; exit 0 }

# Print full record(s) as JSON and formatted key: value
foreach ($row in $foundMatches){
  Write-Output '--- MATCHED ROW ---'
  $row | ConvertTo-Json -Depth 5 | Write-Output
  Write-Output '--- Pretty ---'
  $row.PSObject.Properties | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Name, ($_.Value -replace '\r|\n',' ')) }
}
