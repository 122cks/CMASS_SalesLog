# Generate PNG icons from favicon.svg using ImageMagick (magick)
param(
  [string]$SvgPath = "..\favicon.svg",
  [string]$OutDir = "..\icons"
)

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  Write-Error "ImageMagick 'magick' not found in PATH. Install ImageMagick or provide PNGs manually."
  exit 1
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
magick convert $SvgPath -resize 192x192 "$OutDir\icon-192.png"
magick convert $SvgPath -resize 512x512 "$OutDir\icon-512.png"
Write-Host "Icons generated in $OutDir"
