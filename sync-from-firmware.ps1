# Sync WebUI assets from the private firmware tree into this public repo folder.
param(
  [switch]$BumpCdnOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fw = Join-Path (Split-Path -Parent $root) "P1-Dongel-ESP32"

function Set-CdnPointer {
  param(
    [string]$TargetRoot,
    [string]$Rev
  )

  $cdnConfigPath = Join-Path $TargetRoot "cdn\cdn-config.js"
  $edgePath = Join-Path $TargetRoot "data\DSMRindexEDGE.html"

  @"
// Single source of truth for the frontend CDN location.
// Public repo: pioreq2580/ultra-dongle-web (synced from private ultra-dongle firmware).
// CDN_REV is a git commit SHA (not "main") so jsDelivr serves updates immediately.
// Bumped automatically by sync-from-firmware.ps1 after each sync commit.
window.CDN_REPO = "pioreq2580/ultra-dongle-web";
window.CDN_REV  = "$Rev";
window.CDN_PATH = "cdn";
window.CDN_BASE = `https://cdn.jsdelivr.net/gh/` + window.CDN_REPO + `@` + window.CDN_REV + `/` + window.CDN_PATH;
window.cdnAsset = function (file) {
  return window.CDN_BASE + `/` + file + `?v=` + window.CDN_REV;
};
"@ | Set-Content -Encoding utf8 $cdnConfigPath

  if (Test-Path $edgePath) {
    $edge = Get-Content -Raw $edgePath
    $edge = $edge -replace '(?m)^\s*<!-- Frontend CDN: pioreq2580/ultra-dongle-web@.* -->', "	<!-- Frontend CDN: pioreq2580/ultra-dongle-web@$Rev (public web repo). -->"
    $edge = $edge -replace 'window\.__CDN_REV__\s*=\s*"[^"]+"', "window.__CDN_REV__  = `"$Rev`""
    [System.IO.File]::WriteAllText($edgePath, $edge, (New-Object System.Text.UTF8Encoding $false))
  }

  Write-Host "CDN pinned to commit $Rev"
}

if ($BumpCdnOnly) {
  Push-Location $root
  try {
    $rev = git rev-parse --short HEAD
    if (-not $rev) { throw "Not a git repo or no commits" }
    Set-CdnPointer -TargetRoot $root -Rev $rev
  } finally {
    Pop-Location
  }
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

  $rev = git rev-parse --short HEAD
  if (-not $rev) { throw "Could not resolve git commit for CDN pin" }

  Set-CdnPointer -TargetRoot $root -Rev $rev
  git add cdn/cdn-config.js data/DSMRindexEDGE.html | Out-Null
  $pending = git status --porcelain -- cdn/cdn-config.js data/DSMRindexEDGE.html
  if ($pending) {
    git commit --amend --no-edit | Out-Null
    $rev = git rev-parse --short HEAD
    Set-CdnPointer -TargetRoot $root -Rev $rev
    git add cdn/cdn-config.js data/DSMRindexEDGE.html | Out-Null
    git commit --amend --no-edit | Out-Null
    $rev = git rev-parse --short HEAD
  }
} finally {
  Pop-Location
}

Write-Host "Synced cdn/ and data/ from P1-Dongel-ESP32 (CDN rev $rev)"
