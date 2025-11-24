$file = "c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\input.html"
$lines = Get-Content $file

# Comment out lines 3927-3984 (0-indexed: 3926-3983)
for ($i = 3926; $i -le 3983; $i++) {
    if ($lines[$i] -notmatch '^\s*//') {
        $lines[$i] = "          // " + $lines[$i]
    }
}

Set-Content $file -Value $lines
Write-Host "Fixed syntax errors by commenting out problematic debug code"
