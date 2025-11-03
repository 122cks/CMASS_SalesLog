$inputFile = "c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\input.html"
$lines = Get-Content $inputFile

Write-Host "Original file: $($lines.Count) lines"

# Track which Firestore block we're in
$inFirestoreBlock = $false
$firestoreBlockCount = 0
$output = @()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    
    # Detect start of Firestore block
    if ($line -match '<!-- Firestore Save Functionality -->') {
        $firestoreBlockCount++
        Write-Host "Found Firestore block #$firestoreBlockCount at line $($i+1)"
        
        if ($firestoreBlockCount -eq 1) {
            # Keep the first block
            $output += $line
            $inFirestoreBlock = $false
        } else {
            # Skip all other blocks
            $inFirestoreBlock = $true
            continue
        }
    }
    
    # If we're skipping a duplicate block
    if ($inFirestoreBlock) {
        # Look for the end of the script block
        if ($line -match '^\s*</script>\s*$') {
            # Check if next line is a comment or another Firestore marker
            if ($i + 1 -lt $lines.Count) {
                $nextLine = $lines[$i + 1]
                if ($nextLine -match '<!-- Debug block removed' -or 
                    $nextLine -match '<!-- Portrait-lock' -or
                    $nextLine -match '<style id="cmass-landscape-style">') {
                    # Still in the duplicate section, keep skipping
                    continue
                } else {
                    # End of duplicate block
                    $inFirestoreBlock = $false
                    Write-Host "  Skipped duplicate block ending at line $($i+1)"
                    continue
                }
            }
        }
        continue
    }
    
    # Not in a duplicate block, keep the line
    $output += $line
}

Write-Host "Cleaned file: $($output.Count) lines (removed $($lines.Count - $output.Count) lines)"

# Save the cleaned content
$output | Set-Content $inputFile -Encoding UTF8
