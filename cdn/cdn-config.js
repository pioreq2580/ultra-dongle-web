// CDN helpers — repo/ref/cache are set by DSMRindexEDGE.html before this file loads.
// Never pin commit SHAs here; the device shell owns CDN resolution (@main + cache bust).
window.CDN_REPO = window.__CDN_REPO__ || "pioreq2580/ultra-dongle-web";
window.CDN_REF = window.__CDN_REF__ || "main";
window.CDN_PATH = "cdn";
window.CDN_BASE = window.__cdnBase
  ? window.__cdnBase()
  : "https://cdn.jsdelivr.net/gh/" + window.CDN_REPO + "@" + window.CDN_REF + "/" + window.CDN_PATH;
window.cdnAsset = function (file) {
  return window.__cdnUrl ? window.__cdnUrl(file) : window.CDN_BASE + "/" + file;
};
