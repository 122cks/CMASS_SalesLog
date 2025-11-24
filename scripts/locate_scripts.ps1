#!/usr/bin/env pwsh
# Locate inline <script> blocks in input.html and print their start line numbers
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$allMatches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
for ($i = 0; $i -lt $allMatches.Count; $i++) {
    $m = $allMatches[$i]
    $pos = $m.Index
    $before = $content.Substring(0, $pos)
    $line = ($before -split "\r?\n").Count
    Write-Output "Script[$i] starts at line: $line"
}
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
for ($i = 0; $i -lt $matches.Count; $i++) {
    $m = $matches[$i]
    $pos = $m.Index
    $before = $content.Substring(0, $pos)
    $line = ($before -split "\r?\n").Count
    Write-Output "Script[$i] starts at line: $line"
}
