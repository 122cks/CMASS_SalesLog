<#
Generates Android mipmap launcher icons from a source PNG using ImageMagick (magick)
Usage: .\generate-mipmap-icons.ps1 -Source "..\assets\icon-source.png"
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$Source,
  [string]$OutBase = "..\android-wrapper\app\src\main\res"
)

if (-not (Test-Path $Source)) {
  Write-Error "Source file not found: $Source"
  exit 1
}

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  Write-Error "ImageMagick 'magick' not found in PATH. Install ImageMagick or provide mipmap images manually."
  exit 1
}

$sizes = @{
  'mipmap-mdpi' = 48;
  'mipmap-hdpi' = 72;
  'mipmap-xhdpi' = 96;
  'mipmap-xxhdpi' = 144;
  'mipmap-xxxhdpi' = 192
}

foreach ($k in $sizes.Keys) {
  $dir = Join-Path $OutBase $k
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $size = $sizes[$k]
  $out = Join-Path $dir 'ic_launcher.png'
  magick convert $Source -resize ${size}x${size} $out
  Write-Host "Wrote: $out"
}

Write-Host "Mipmap icons generated. Update adaptive icon if needed (mipmap-anydpi-v26/ic_launcher.xml)."
