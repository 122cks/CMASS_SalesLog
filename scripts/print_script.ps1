#!/usr/bin/env pwsh
param([int]$Index)
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$allMatches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
if ($Index -lt 0 -or $Index -ge $allMatches.Count) { Write-Error "Index out of range: $Index (count=$($allMatches.Count))"; exit 1 }
Write-Output $allMatches[$Index].Groups[1].Value
param([int]$Index)
$path = Join-Path $PSScriptRoot '..\public\input.html'
$content = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($content, '<script[^>]*>([\s\S]*?)</script>', 'IgnoreCase')
if ($Index -lt 0 -or $Index -ge $matches.Count) { Write-Error "Index out of range: $Index (count=$($matches.Count))"; exit 1 }
Write-Output $matches[$Index].Groups[1].Value
