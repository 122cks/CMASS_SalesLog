#!/usr/bin/env pwsh
# Count braces/parens/brackets in each inline <script> block for quick balance diagnostics
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$allMatches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
Write-Output "Total scripts: $($allMatches.Count)"
for ($i=0; $i -lt $allMatches.Count; $i++) {
    $b = $allMatches[$i].Groups[1].Value
    $openCurly = ($b -split '\{').Count - 1
    $closeCurly = ($b -split '\}').Count - 1
    $openParen = ($b -split '\(').Count - 1
    $closeParen = ($b -split '\)').Count - 1
    $openBrack = ($b -split '\[').Count - 1
    $closeBrack = ($b -split '\]').Count - 1
    Write-Output "Script[$i]: { {=$openCurly, }=$closeCurly, (=$openParen, )=$closeParen, [=$openBrack, ]=$closeBrack }"
}
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
Write-Output "Total scripts: $($matches.Count)"
for ($i=0; $i -lt $matches.Count; $i++) {
    $b = $matches[$i].Groups[1].Value
    $openCurly = ($b -split '\{').Count - 1
    $closeCurly = ($b -split '\}').Count - 1
    $openParen = ($b -split '\(').Count - 1
    $closeParen = ($b -split '\)').Count - 1
    $openBrack = ($b -split '\[').Count - 1
    $closeBrack = ($b -split '\]').Count - 1
    Write-Output "Script[$i]: { {=$openCurly, }=$closeCurly, (=$openParen, )=$closeParen, [=$openBrack, ]=$closeBrack }"
}
