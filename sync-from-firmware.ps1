# Sync WebUI assets from the private firmware tree into this public repo folder.
param(
  [switch]$BumpCdnOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fw = Join-Path (Split-Path -Parent $root) "P1-Dongel-ESP32"

if ($BumpCdnOnly) {
  Write-Host "CDN uses @main from device shell; no rev bump needed."
  exit 0
}

if (-not (Test-Path $fw)) {
  Write-Error "Firmware folder not found: $fw"
}

Remove-Item -Recurse -Force (Join-Path $root "cdn"), (Join-Path $root "data") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force (Join-Path $fw "cdn") (Join-Path $root "cdn")
Copy-Item -Recurse -Force (Join-Path $fw "data") (Join-Path $root "data")

Push-Location $root
try {
  git add -A | Out-Null
  $status = git status --porcelain
  if ($status) {
    git commit -m "chore: sync WebUI from ultra-dongle firmware" | Out-Null
  }
} finally {
  Pop-Location
}

Write-Host "Synced cdn/ and data/ from P1-Dongel-ESP32 (CDN @main, no SHA pin)"
