Param(
  [string]$Path
)
if (-not $Path) { Write-Error 'Path required'; exit 2 }

$stack = @()
$i = 1
$errors = @()

Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  
  # Find all tags in this line
  $openMatches = [regex]::Matches($line, '<(\w+)[^>]*(?<!/)>')
  $closeMatches = [regex]::Matches($line, '</(\w+)>')
  $selfClosing = [regex]::Matches($line, '<(\w+)[^>]*/>')
  
  foreach ($m in $openMatches) {
    $tag = $m.Groups[1].Value.ToLower()
    # Skip void elements that don't need closing
    if ($tag -notin @('meta','link','input','br','hr','img','area','base','col','embed','param','source','track','wbr')) {
      $stack += @{Tag=$tag; Line=$i}
    }
  }
  
  foreach ($m in $closeMatches) {
    $tag = $m.Groups[1].Value.ToLower()
    if ($stack.Count -gt 0 -and $stack[-1].Tag -eq $tag) {
      $stack = $stack[0..($stack.Count-2)]
    } else {
      $errors += "Line $i : Unexpected closing tag </$tag>"
    }
  }
  
  $i++
}

if ($stack.Count -gt 0) {
  foreach ($item in $stack) {
    $errors += "Line $($item.Line): Unclosed tag <$($item.Tag)>"
  }
}

if ($errors.Count -eq 0) {
  Write-Output 'NO_HTML_ERRORS'
} else {
  $errors | ForEach-Object { Write-Output $_ }
}
