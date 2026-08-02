// Single source of truth for the frontend CDN location.
// Public repo: pioreq2580/ultra-dongle-web (synced from private ultra-dongle firmware).
// CDN_REV is a git commit SHA (not "main") so jsDelivr serves updates immediately.
// Bumped automatically by sync-from-firmware.ps1 after each sync commit.
window.CDN_REPO = "pioreq2580/ultra-dongle-web";
window.CDN_REV  = "dfc6f1d";
window.CDN_PATH = "cdn";
window.CDN_BASE = "https://cdn.jsdelivr.net/gh/" + window.CDN_REPO + "@" + window.CDN_REV + "/" + window.CDN_PATH;
window.cdnAsset = function (file) {
  return window.CDN_BASE + "/" + file + "?v=" + window.CDN_REV;
};