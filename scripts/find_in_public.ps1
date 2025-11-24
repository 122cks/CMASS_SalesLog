param([string]$pattern)
$files = Get-ChildItem -Path (Join-Path $PSScriptRoot '..\public') -Recurse -File -ErrorAction SilentlyContinue
foreach ($f in $files) {
  try {
    $match = Select-String -Path $f.FullName -Pattern $pattern -SimpleMatch -List -ErrorAction SilentlyContinue
    if ($match) { foreach ($m in $match) { Write-Output "$($f.FullName):$($m.LineNumber): $($m.Line.Trim())" } }
  } catch { }
}