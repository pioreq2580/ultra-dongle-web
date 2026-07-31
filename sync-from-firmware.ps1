# Sync WebUI assets from the private firmware tree into this public repo folder.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fw = Join-Path (Split-Path -Parent $root) "P1-Dongel-ESP32"

if (-not (Test-Path $fw)) {
  Write-Error "Firmware folder not found: $fw"
}

Remove-Item -Recurse -Force (Join-Path $root "cdn"), (Join-Path $root "data")
Copy-Item -Recurse -Force (Join-Path $fw "cdn") (Join-Path $root "cdn")
Copy-Item -Recurse -Force (Join-Path $fw "data") (Join-Path $root "data")

@'
// Single source of truth for the frontend CDN location.
// Public repo: pioreq2580/ultra-dongle-web (synced from private ultra-dongle firmware).
// Keep CDN_REPO / CDN_REF in sync with CDN_FORK_* in P1-Dongel-ESP32/Config.h.
window.CDN_REPO = "pioreq2580/ultra-dongle-web";
window.CDN_REF  = "main";
window.CDN_PATH = "cdn";
window.CDN_BASE = `https://cdn.jsdelivr.net/gh/${window.CDN_REPO}@${window.CDN_REF}/${window.CDN_PATH}`;
'@ | Set-Content -Encoding utf8 (Join-Path $root "cdn\cdn-config.js")

Write-Host "Synced cdn/ and data/ from P1-Dongel-ESP32"
