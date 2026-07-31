# ultra-dongle-web

Public frontend assets for the Ultra Dongle (WebUI shell, JS, CSS, i18n).

The private firmware repo [`ultra-dongle`](https://github.com/pioreq2580/ultra-dongle) points here for jsDelivr CDN delivery. This repo contains **no firmware** and no secrets.

## Layout

```
cdn/          WebUI assets (DSMRindex.js, DSMRindex_body.html, lang/, …)
data/         Index shell uploaded to device LittleFS (DSMRindexEDGE.html)
```

## Initial setup

1. Create a **public** GitHub repo named `ultra-dongle-web`.
2. Push the contents of this folder to `main`:

   ```powershell
   cd ultra-dongle-web
   git init
   git add cdn data README.md sync-from-firmware.ps1
   git commit -m "feat: initial public WebUI for ultra-dongle"
   git branch -M main
   git remote add origin https://github.com/pioreq2580/ultra-dongle-web.git
   git push -u origin main
   ```

3. Verify jsDelivr (wait 2–5 min after push):

   - https://cdn.jsdelivr.net/gh/pioreq2580/ultra-dongle-web@main/cdn/DSMRindex.js
   - https://cdn.jsdelivr.net/gh/pioreq2580/ultra-dongle-web@main/data/DSMRindexEDGE.html

4. On the dongle: delete `/DSMRindexEDGE.html` in File Explorer, reboot (or re-upload from `data/`), then hard-refresh the browser.

## Sync from firmware repo

After changing UI files in `P1-Dongel-ESP32/cdn/` or `P1-Dongel-ESP32/data/`:

```powershell
./sync-from-firmware.ps1
git add -A
git commit -m "chore: sync WebUI from ultra-dongle firmware"
git push
```

## Config sync

These must stay aligned:

| Private firmware | Public web repo |
|---|---|
| `P1-Dongel-ESP32/Config.h` → `CDN_FORK_REPO` | `cdn/cdn-config.js` → `CDN_REPO` |
| `P1-Dongel-ESP32/data/DSMRindexEDGE.html` | `data/DSMRindexEDGE.html` |

Both currently use `pioreq2580/ultra-dongle-web@main`.
