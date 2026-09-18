// Single source of truth for the frontend CDN location.
// Keep CDN_REPO / CDN_REF in sync with CDN_FORK_REPO / CDN_FORK_REF in Config.h.
window.CDN_REPO = "pioreq2580/ultra-dongle-web";
window.CDN_REF  = "main";
window.CDN_BASE = `https://cdn.jsdelivr.net/gh/${window.CDN_REPO}@${window.CDN_REF}/cdn`;
