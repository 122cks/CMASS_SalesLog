Write-Output 'Copying neis_grid.js to public/'
Copy-Item -LiteralPath .\neis_grid.js -Destination .\public\neis_grid.js -Force

Write-Output 'Creating public/service-worker.js and sw.js'
$sw = @'
self.addEventListener("install", event => { console.log("SW: install"); self.skipWaiting(); });
self.addEventListener("activate", event => { console.log("SW: activate"); self.clients.claim(); });
self.addEventListener('fetch', event => { /* pass-through */ });
'@
Set-Content -LiteralPath .\public\service-worker.js -Value $sw -Encoding UTF8
Set-Content -LiteralPath .\public\sw.js -Value $sw -Encoding UTF8

Write-Output 'Creating public/manifest.json'
$manifest = @'
{
  "name": "CMASS Sales",
  "short_name": "CMASS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2b6cb0",
  "icons": [
    { "src": "/assets/CMASS_LOGO.png", "sizes": "512x512", "type": "image/png" }
  ]
}
'@
Set-Content -LiteralPath .\public\manifest.json -Value $manifest -Encoding UTF8

Write-Output 'Creating public/favicon.ico as copy of assets PNG (avoids 404)'
Copy-Item -LiteralPath .\public\assets\CMASS_LOGO.png -Destination .\public\favicon.ico -Force

Write-Output 'Files created/copied'

Write-Output 'Deploying hosting'
firebase deploy --only hosting --project cmass-sales
