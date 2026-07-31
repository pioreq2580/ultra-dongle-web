// Single source of truth for the frontend CDN location.
// Public repo: pioreq2580/ultra-dongle-web (synced from private ultra-dongle firmware).
// Keep CDN_REPO / CDN_REF in sync with CDN_FORK_* in P1-Dongel-ESP32/Config.h.
window.CDN_REPO = "pioreq2580/ultra-dongle-web";
window.CDN_REF  = "main";
window.CDN_PATH = "cdn";
window.CDN_BASE = `https://cdn.jsdelivr.net/gh/${window.CDN_REPO}@${window.CDN_REF}/${window.CDN_PATH}`;
