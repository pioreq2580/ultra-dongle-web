function wizApi(path, method, body) {
  const opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(APIHOST + path, opts).then(async r => {
    const text = await r.text();
    if (!r.ok) throw new Error(text || ("HTTP " + r.status));
    try { return JSON.parse(text); }
    catch { throw new Error("Invalid JSON from device"); }
  });
}

function wizEscapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function wizRgbToHex(r, g, b) {
  const h = n => ("0" + Math.max(0, Math.min(255, n | 0)).toString(16)).slice(-2);
  return "#" + h(r) + h(g) + h(b);
}

function wizHexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function wizRgbChannel(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(255, n));
}

function wizRgbToHsv(r, g, b) {
  r = wizRgbChannel(r, 0) / 255;
  g = wizRgbChannel(g, 0) / 255;
  b = wizRgbChannel(b, 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: h, s: max === 0 ? 0 : d / max, v: max };
}

function wizHsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  v = Math.max(0, Math.min(1, v));
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function wizIsGenericName(light) {
  const name = String((light && light.name) || "").trim();
  if (!name) return true;
  if (light.mac && name === light.mac) return true;
  if (light.mac && name === "WiZ " + light.mac) return true;
  if (light.module_name && name === light.module_name) return true;
  if (/^ESP\d+_/.test(name)) return true;
  return false;
}

function wizDisplayName(light) {
  if (!wizIsGenericName(light)) return light.name;
  return (light && light.mac) || (light && light.name) || "";
}

function wizMetaLine(light) {
  const parts = [];
  if (light.module_name && light.module_name !== light.name) parts.push(light.module_name);
  if (light.ip) parts.push(light.ip);
  if (light.mac) parts.push(light.mac);
  return parts.join(" Â· ");
}

function wizIsMockLight(light) {
  if (!light) return true;
  const mac = String(light.mac || "").toLowerCase();
  if (mac === WIZ_MOCK_MAC) return true;
  const label = String(light.name || light.module_name || "");
  return /mock/i.test(label);
}

function wizLightIsRgb(light) {
  if (!light) return false;
  if (light.rgb === true) return true;
  const moduleName = String(light.module_name || light.name || "");
  if (/RGB/i.test(moduleName)) return true;
  if (light.rgb === false) return false;
  return false;
}

function wizRoomSectionKey(roomId) {
  return "room-" + (roomId || 0);
}

function wizRoomDisplayName(roomId) {
  if (!roomId) return typeof t === "function" ? t("wiz-room-unassigned") : "Unassigned";
  const room = wizConfiguredRooms.find(r => r.id === roomId);
  if (room && room.name) return room.name;
  return typeof t === "function" ? t("wiz-room-unnamed") : "Unnamed room";
}

function wizScanRoomLabel(item) {
  if (item.room) return item.room;
  if (item.room_id) return wizRoomDisplayName(item.room_id);
  return "â€”";
}

function wizGroupLightsByRoom(lights) {
  const groups = new Map();
  lights.forEach(light => {
    const key = String(light.room_id || 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(light);
  });
  return [...groups.entries()].sort((a, b) => {
    const idA = parseInt(a[0], 10) || 0;
    const idB = parseInt(b[0], 10) || 0;
    if (idA === 0) return 1;
    if (idB === 0) return -1;
    return wizRoomDisplayName(idA).localeCompare(wizRoomDisplayName(idB));
  });
}

function wizLightIsCct(light) {
  if (!light) return false;
  if (light.cct === true || light.temp) return true;
  const moduleName = String(light.module_name || light.name || "");
  if (/SHRGB|_TW|TW_|RGB/i.test(moduleName)) return true;
  if (light.cct === false) return false;
  return false;
}

function wizApplyI18n(root) {
  if (typeof applyTranslations === "function") applyTranslations(root);
}

function wizSetInputValue(el, value) {
  if (!el || document.activeElement === el) return;
  el.value = value;
}

function wizSetStatus(text, isError) {
  const el = document.getElementById("wiz_status");
  if (!el) return;
  el.textContent = text || "";
  el.className = "wiz-status" + (isError ? " wiz-error" : "");
}

function wizStopPolling() {
  if (wizScanTimer) { clearInterval(wizScanTimer); wizScanTimer = null; }
  if (wizPageTimer) { clearInterval(wizPageTimer); wizPageTimer = null; }
}

function wizPagePollMs() {
  const sec = Math.max(10, parseInt(wizPollSec, 10) || 30);
  return sec * 1000;
}

function wizShouldPoll() {
  return activeTab === "bWizLights" && document.visibilityState === "visible";
}

function wizLoadConfig() {
  return wizApi("/api/v2/wiz/config").then(json => {
    document.getElementById("wiz_enabled").checked = !!json.enabled;
    document.getElementById("wiz_poll").value = json.poll_sec || 30;
    wizPollSec = json.poll_sec || 30;
    wizConfiguredRooms = json.rooms || [];
    wizConfiguredLights = (json.lights || []).filter(l => !wizIsMockLight(l)).map(l => ({
      mac: l.mac,
      ip: l.ip,
      name: l.name,
      room: l.room || "",
      room_id: l.room_id || 0,
      enabled: l.enabled !== false
    }));
    return json;
  });
}

function wizSaveConfig() {
  const payload = {
    enabled: document.getElementById("wiz_enabled").checked,
    poll_sec: parseInt(document.getElementById("wiz_poll").value, 10) || 30,
    rooms: wizConfiguredRooms,
    lights: wizConfiguredLights.filter(l => !wizIsMockLight(l))
  };
  return wizApi("/api/v2/wiz/config", "POST", payload)
    .then(() => wizSetStatus("Configuration saved.", false))
    .catch(err => wizSetStatus("Save failed: " + err, true));
}

function wizSaveRoomName(roomId, name) {
  roomId = parseInt(roomId, 10) || 0;
  if (!roomId) return Promise.resolve();
  const trimmed = (name || "").trim();
  let room = wizConfiguredRooms.find(r => r.id === roomId);
  if (room) room.name = trimmed;
  else wizConfiguredRooms.push({ id: roomId, name: trimmed });
  wizConfiguredLights.forEach(l => {
    if (l.room_id === roomId) l.room = trimmed;
  });
  return wizSaveConfig();
}

function wizRoomCommand(roomId, on) {
  roomId = parseInt(roomId, 10) || 0;
  if (!roomId) return;
  wizSendCommand({ room_id: roomId, on: on });
}

function wizScanProgressText(json) {
  const pct = json.progress || 0;
  const found = (json.results || []).length;
  const foundNote = found ? " â€” found " + found + " light" + (found === 1 ? "" : "s") : "";
  if (json.scan_phase === "broadcast") {
    return (typeof t === "function" ? t("wiz-scan-broadcast") : "Broadcastâ€¦") + " " + pct + "%" + foundNote;
  }
  if (json.scan_phase === "subnet" && json.scan_last_host) {
    return (typeof t === "function" ? t("wiz-scan-subnet") : "Scanning") + " " + json.scan_last_host + " (" + pct + "%)" + foundNote;
  }
  if (json.scan_phase === "configured") {
    return (typeof t === "function" ? t("wiz-scan-configured") : "Checking saved lightsâ€¦") + foundNote;
  }
  if (json.scan_phase === "probe") {
    return (typeof t === "function" ? t("wiz-scan-probe") : "Probing") + " " + (json.scan_last_host || "") + "â€¦";
  }
  return (typeof t === "function" ? t("wiz-scan-progress") : "Scanningâ€¦") + " " + pct + "%" + foundNote;
}

function wizStatusBadge(light) {
  if (!light.online) return typeof t === "function" ? t("wiz-status-offline") : "Offline";
  if (!light.on) return typeof t === "function" ? t("wiz-status-off") : "Off";
  return typeof t === "function" ? t("wiz-status-online") : "Online";
}

function wizCardClass(light) {
  if (!light.online) return " wiz-offline";
  if (!light.on) return " wiz-off";
  return " wiz-online";
}

function wizBindScanTable() {
  const body = document.getElementById("wiz_scan_body");
  if (!body || body.dataset.bound) return;
  body.dataset.bound = "1";
  body.addEventListener("change", event => {
    const el = event.target;
    if (!el.classList.contains("wiz-scan-check") || !el.dataset.mac) return;
    if (el.checked) wizScanSelectedMacs.add(el.dataset.mac);
    else wizScanSelectedMacs.delete(el.dataset.mac);
  });
}

function wizScan() {
  wizScanSelectedMacs = new Set();
  wizSetStatus(typeof t === "function" ? t("wiz-scan-starting") : "Starting network scan...", false);
  document.getElementById("wiz_scan_progress").textContent = "";
  const scanBody = document.getElementById("wiz_scan_body");
  if (scanBody) scanBody.innerHTML = "";
  document.getElementById("wiz_scan_table").style.display = "none";
  wizApi("/api/v2/wiz/discover", "POST", {})
    .then(() => {
      if (wizScanTimer) clearInterval(wizScanTimer);
      wizScanTimer = setInterval(wizPollScan, WIZ_SCAN_POLL_MS);
      wizPollScan();
    })
    .catch(err => wizSetStatus("Scan failed: " + err, true));
}

function wizProbeIp() {
  const input = document.getElementById("wiz_probe_ip");
  const ip = input ? input.value.trim() : "";
  if (!ip) {
    wizSetStatus(typeof t === "function" ? t("wiz-probe-ip-required") : "Enter an IP address.", true);
    return;
  }
  wizSetStatus((typeof t === "function" ? t("wiz-scan-probe") : "Probing") + " " + ip + "...", false);
  wizApi("/api/v2/wiz/discover", "POST", { mode: "probe", ip: ip })
    .then(() => {
      if (wizScanTimer) clearInterval(wizScanTimer);
      wizScanTimer = setInterval(wizPollScan, WIZ_SCAN_POLL_MS);
      wizPollScan();
    })
    .catch(err => wizSetStatus("Probe failed: " + err, true));
}

function wizPollScan() {
  if (!wizShouldPoll()) return;
  wizApi("/api/v2/wiz/discover")
    .then(json => {
      const prog = document.getElementById("wiz_scan_progress");
      if (json.phase === WIZ_DISCOVER_SCANNING) {
        const partial = (json.results || []).filter(item => !wizIsMockLight(item));
        if (partial.length) wizRenderScanResults(partial);
        prog.textContent = wizScanProgressText(json);
      } else if (json.phase === WIZ_DISCOVER_DONE) {
        if (wizScanTimer) { clearInterval(wizScanTimer); wizScanTimer = null; }
        prog.textContent = "";
        const results = (json.results || []).filter(item => !wizIsMockLight(item));
        wizRenderScanResults(results);
        const n = results.length;
        wizSetStatus(n
          ? ((typeof t === "function" ? t("wiz-scan-done") : "Found") + " " + n + " light(s).")
          : (typeof t === "function" ? t("wiz-scan-none") : "Scan complete â€” no WiZ lights found on this subnet."), false);
      } else if (json.phase === WIZ_DISCOVER_ERROR) {
        if (wizScanTimer) { clearInterval(wizScanTimer); wizScanTimer = null; }
        prog.textContent = "";
        wizSetStatus(json.error || "Scan failed", true);
      }
    })
    .catch(err => {
      if (wizScanTimer) { clearInterval(wizScanTimer); wizScanTimer = null; }
      wizSetStatus("Scan poll failed: " + err, true);
    });
}

function wizRenderScanResults(results) {
  const table = document.getElementById("wiz_scan_table");
  const body = document.getElementById("wiz_scan_body");
  if (!table || !body) return;
  wizBindScanTable();
  if (!results.length) { table.style.display = "none"; return; }
  table.style.display = "table";

  document.querySelectorAll(".wiz-scan-check:checked").forEach(ch => {
    if (ch.dataset.mac) wizScanSelectedMacs.add(ch.dataset.mac);
  });

  const known = new Set((wizConfiguredLights || []).map(l => l.mac));
  const existing = new Map();
  body.querySelectorAll("tr[data-mac]").forEach(tr => existing.set(tr.dataset.mac, tr));

  results.forEach(item => {
    if (!item.mac) return;
    const already = known.has(item.mac);
    const label = wizDisplayName(item);
    const roomId = item.room_id || 0;
    const roomLabel = wizScanRoomLabel(item);
    let tr = existing.get(item.mac);
    if (!tr) {
      tr = document.createElement("tr");
      tr.dataset.mac = item.mac;
      tr.innerHTML =
        "<td><input type='checkbox' class='wiz-scan-check' data-mac='" + wizEscapeHtml(item.mac) + "'></td>" +
        "<td><strong></strong></td>" +
        "<td class='wiz-scan-room'></td>" +
        "<td class='wiz-scan-ip'></td>" +
        "<td class='wiz-mac-cell'></td>";
      body.appendChild(tr);
    }
    const check = tr.querySelector(".wiz-scan-check");
    if (check) {
      check.dataset.mac = item.mac;
      check.dataset.ip = item.ip || "";
      check.dataset.name = label;
      check.dataset.roomId = String(roomId);
      check.dataset.room = item.room || "";
      check.disabled = already;
      if (already) {
        check.checked = false;
        wizScanSelectedMacs.delete(item.mac);
      } else if (wizScanSelectedMacs.has(item.mac)) {
        check.checked = true;
      }
    }
    const nameEl = tr.querySelector("strong");
    if (nameEl) nameEl.textContent = label;
    const roomEl = tr.querySelector(".wiz-scan-room");
    if (roomEl) roomEl.textContent = roomLabel;
    const ipEl = tr.querySelector(".wiz-scan-ip");
    if (ipEl) ipEl.textContent = item.ip || "";
    const macEl = tr.querySelector(".wiz-mac-cell");
    if (macEl) macEl.textContent = item.mac;
  });
}

function wizAddSelected() {
  const checks = document.querySelectorAll(".wiz-scan-check:checked");
  if (!checks.length) {
    wizSetStatus("Select at least one light.", true);
    return;
  }
  const known = new Set((wizConfiguredLights || []).map(l => l.mac));
  checks.forEach(ch => {
    const mac = ch.dataset.mac;
    if (!mac || known.has(mac) || mac === WIZ_MOCK_MAC) return;
    const roomId = parseInt(ch.dataset.roomId, 10) || 0;
    const roomName = ch.dataset.room || "";
    wizConfiguredLights.push({
      mac: mac,
      ip: ch.dataset.ip || "",
      name: (ch.dataset.name && ch.dataset.name !== ch.dataset.mac) ? ch.dataset.name : mac,
      room_id: roomId,
      room: roomName,
      enabled: true
    });
    if (roomId && roomName) {
      const room = wizConfiguredRooms.find(r => r.id === roomId);
      if (room) room.name = roomName;
      else wizConfiguredRooms.push({ id: roomId, name: roomName });
    }
    known.add(mac);
  });
  wizSaveConfig().then(() => wizRefreshLights());
}

function wizRefreshLights(force) {
  if (!force && !wizShouldPoll()) return Promise.resolve();
  return wizApi("/api/v2/wiz/lights")
    .then(json => {
      wizPollSec = json.poll_sec || wizPollSec;
      wizConfiguredRooms = json.rooms || wizConfiguredRooms;
      wizConfiguredLights = (json.lights || [])
        .filter(l => !wizIsMockLight(l))
        .map(l => ({
          mac: l.mac, ip: l.ip, name: l.name, room: l.room || "", room_id: l.room_id || 0,
          enabled: l.enabled !== false
        }));
      wizRenderLightGrid((json.lights || []).filter(l => !wizIsMockLight(l)));
    })
    .catch(err => wizSetStatus("Load failed: " + err, true));
}

function wizBuildRgbHtml(light) {
  if (!wizLightIsRgb(light)) return "";
  const r = wizRgbChannel(light.r, 255);
  const g = wizRgbChannel(light.g, 255);
  const b = wizRgbChannel(light.b, 255);
  const hsv = wizRgbToHsv(r, g, b);
  const hex = wizRgbToHex(r, g, b);
  return (
    "<div class='wiz-rgb-controls' data-mac='" + wizEscapeHtml(light.mac) +
      "' data-r='" + r + "' data-g='" + g + "' data-b='" + b + "' data-h='" + hsv.h.toFixed(1) + "'>" +
      "<div class='wiz-color-picker'>" +
        "<div class='wiz-color-head'>" +
          "<span class='wiz-ctrl-label' data-i18n-key='wiz-color'>Color</span>" +
          "<span class='wiz-color-swatch' style='background:" + hex + "' aria-hidden='true'></span>" +
        "</div>" +
        "<div class='wiz-sv-pad' role='slider' aria-label='Color'>" +
          "<div class='wiz-sv-cursor' style='left:" + ((hsv.h / 360) * 100).toFixed(1) +
            "%;top:" + (hsv.s * 100).toFixed(1) + "%'></div>" +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function wizBuildCctHtml(light) {
  if (!wizLightIsCct(light)) return "";
  const temp = Math.max(WIZ_CCT_MIN, Math.min(WIZ_CCT_MAX, parseInt(light.temp, 10) || 4200));
  return (
    "<div class='wiz-cct-controls' data-mac='" + wizEscapeHtml(light.mac) + "'>" +
      "<label class='wiz-cct-label'><span data-i18n-key='wiz-cct'>Color temperature</span>" +
        "<input type='range' min='" + WIZ_CCT_MIN + "' max='" + WIZ_CCT_MAX + "' step='100' value='" + temp + "' class='wiz-temp' data-mac='" + wizEscapeHtml(light.mac) + "'>" +
        "<span class='wiz-temp-label'>" + temp + " K</span>" +
      "</label>" +
    "</div>"
  );
}

function wizBuildCardHtml(light) {
  const dimPct = Math.round((light.dimming || 0) * 100 / 255);
  const displayName = wizDisplayName(light);
  const meta = wizMetaLine(light);
  return (
    "<h1 class='wiz-badge'>" + wizEscapeHtml(wizStatusBadge(light)) + "</h1>" +
    "<div class='wiz-card-body'>" +
      "<div class='wiz-card-head'>" +
        "<div class='wiz-title-block'>" +
          "<input type='text' class='wiz-name-input' value='" + wizEscapeHtml(displayName) + "' data-mac='" + wizEscapeHtml(light.mac) + "' data-i18n-placeholder='wiz-name-placeholder' placeholder='Light name'>" +
        "</div>" +
        "<button type='button' class='wiz-remove' data-mac='" + wizEscapeHtml(light.mac) + "' title='Remove'>&times;</button>" +
      "</div>" +
      (meta ? "<div class='wiz-card-meta'>" + wizEscapeHtml(meta) + "</div>" : "") +
      "<div class='wiz-card-controls'>" +
        "<label><input type='checkbox' class='wiz-toggle' data-mac='" + wizEscapeHtml(light.mac) + "'" + (light.on ? " checked" : "") + "> <span data-i18n-key='wiz-on'>On</span></label>" +
        "<input type='range' min='0' max='100' value='" + dimPct + "' class='wiz-dim' data-mac='" + wizEscapeHtml(light.mac) + "'>" +
        "<span class='wiz-dim-label'>" + dimPct + "%</span>" +
      "</div>" +
      wizBuildRgbHtml(light) +
      wizBuildCctHtml(light) +
    "</div>"
  );
}

function wizUpdateLightCard(card, light) {
  card.dataset.mac = light.mac;
  card.className = "card wiz-card" + wizCardClass(light);

  const badge = card.querySelector(".wiz-badge");
  if (badge) badge.textContent = wizStatusBadge(light);

  const meta = card.querySelector(".wiz-card-meta");
  const metaText = wizMetaLine(light);
  if (metaText) {
    if (meta) meta.textContent = metaText;
    else {
      const head = card.querySelector(".wiz-card-head");
      if (head) {
        const metaEl = document.createElement("div");
        metaEl.className = "wiz-card-meta";
        metaEl.textContent = metaText;
        head.insertAdjacentElement("afterend", metaEl);
      }
    }
  } else if (meta) {
    meta.remove();
  }

  wizSetInputValue(card.querySelector(".wiz-name-input"), wizDisplayName(light));

  const toggle = card.querySelector(".wiz-toggle");
  if (toggle && document.activeElement !== toggle) toggle.checked = !!light.on;

  const dim = card.querySelector(".wiz-dim");
  const dimPct = Math.round((light.dimming || 0) * 100 / 255);
  wizSetInputValue(dim, String(dimPct));
  const dimLabel = card.querySelector(".wiz-dim-label");
  if (dimLabel && document.activeElement !== dim) dimLabel.textContent = dimPct + "%";

  const body = card.querySelector(".wiz-card-body") || card;
  let rgbBlock = card.querySelector(".wiz-rgb-controls");
  if (wizLightIsRgb(light)) {
    const html = wizBuildRgbHtml(light);
    if (!rgbBlock || !rgbBlock.querySelector(".wiz-sv-pad") || rgbBlock.querySelector(".wiz-hue")) {
      if (rgbBlock) rgbBlock.outerHTML = html;
      else {
        const cct = card.querySelector(".wiz-cct-controls");
        if (cct) cct.insertAdjacentHTML("beforebegin", html);
        else body.insertAdjacentHTML("beforeend", html);
      }
      rgbBlock = card.querySelector(".wiz-rgb-controls");
    } else {
      wizSyncRgbInputs(rgbBlock, wizRgbChannel(light.r, 255), wizRgbChannel(light.g, 255), wizRgbChannel(light.b, 255));
    }
  } else if (rgbBlock) {
    rgbBlock.remove();
  }

  let cctBlock = card.querySelector(".wiz-cct-controls");
  if (wizLightIsCct(light)) {
    const temp = Math.max(WIZ_CCT_MIN, Math.min(WIZ_CCT_MAX, parseInt(light.temp, 10) || 4200));
    if (!cctBlock) {
      body.insertAdjacentHTML("beforeend", wizBuildCctHtml(light));
      cctBlock = card.querySelector(".wiz-cct-controls");
    } else {
      wizSetInputValue(cctBlock.querySelector(".wiz-temp"), String(temp));
      const tempLabel = cctBlock.querySelector(".wiz-temp-label");
      if (tempLabel && document.activeElement !== cctBlock.querySelector(".wiz-temp")) {
        tempLabel.textContent = temp + " K";
      }
    }
  } else if (cctBlock) {
    cctBlock.remove();
  }
}

function wizCreateLightCard(light) {
  const card = document.createElement("div");
  card.className = "card wiz-card" + wizCardClass(light);
  card.dataset.mac = light.mac;
  card.innerHTML = wizBuildCardHtml(light);
  return card;
}

function wizEnsureRoomSection(grid, roomId) {
  const key = wizRoomSectionKey(roomId);
  let section = grid.querySelector('.wiz-room[data-room-key="' + key + '"]');
  if (!section) {
    section = document.createElement("div");
    section.className = "wiz-room";
    section.dataset.roomKey = key;
    section.dataset.roomId = String(roomId || 0);
    if (roomId) {
      section.innerHTML =
        "<div class='wiz-room-head'>" +
          "<span class='wiz-room-title'></span>" +
          "<div class='wiz-room-actions'>" +
            "<button type='button' class='wiz-room-on' data-room-id='" + roomId + "' data-i18n-key='wiz-btn-all-on'>All on</button>" +
            "<button type='button' class='wiz-room-off' data-room-id='" + roomId + "' data-i18n-key='wiz-btn-all-off'>All off</button>" +
          "</div>" +
        "</div>" +
        "<div class='wiz-room-grid'></div>";
    } else {
      section.innerHTML =
        "<div class='wiz-room-head wiz-room-head-static'>" +
          "<span class='wiz-room-title' data-i18n-key='wiz-room-unassigned'>Unassigned</span>" +
        "</div>" +
        "<div class='wiz-room-grid'></div>";
    }
    grid.appendChild(section);
  }
  const leftover = section.querySelector(".wiz-room-name-input");
  if (leftover) leftover.remove();
  const titleEl = section.querySelector(".wiz-room-title");
  if (titleEl && roomId) {
    const room = wizConfiguredRooms.find(r => r.id === roomId);
    const name = room && room.name ? String(room.name).trim() : "";
    titleEl.textContent = name;
    titleEl.style.display = name ? "" : "none";
  }
  return section.querySelector(".wiz-room-grid");
}

function wizInitLightGrid() {
  const grid = document.getElementById("wiz_light_grid");
  if (!grid || grid.dataset.bound) return;
  grid.dataset.bound = "1";

  grid.addEventListener("change", event => {
    const el = event.target;
    const mac = el.dataset.mac;
    if (!mac) return;

    if (el.classList.contains("wiz-toggle")) {
      const card = el.closest(".wiz-card");
      wizSendCommand({ mac: mac, on: el.checked }, card);
      return;
    }
    if (el.classList.contains("wiz-dim")) {
      const pct = parseInt(el.value, 10) || 0;
      const label = el.parentElement.querySelector(".wiz-dim-label");
      if (label) label.textContent = pct + "%";
      const card = el.closest(".wiz-card");
      const payload = { mac: mac, on: true, dimming: Math.round(pct * 255 / 100) };
      wizApplyCardRgb(card, payload);
      wizSendCommand(payload, card);
      return;
    }
    if (el.classList.contains("wiz-temp")) {
      const temp = parseInt(el.value, 10) || WIZ_CCT_MIN;
      const card = el.closest(".wiz-card");
      const tempLabel = el.parentElement.querySelector(".wiz-temp-label");
      if (tempLabel) tempLabel.textContent = temp + " K";
      wizSendTempDebounced(mac, temp, card);
      return;
    }
    if (el.classList.contains("wiz-name-input")) {
      const item = wizConfiguredLights.find(l => l.mac === mac);
      if (item) item.name = el.value.trim() || mac;
      wizSaveConfig();
    }
  });

  grid.addEventListener("input", event => {
    const el = event.target;
    if (el.classList.contains("wiz-temp")) {
      const temp = parseInt(el.value, 10) || WIZ_CCT_MIN;
      const tempLabel = el.parentElement && el.parentElement.querySelector(".wiz-temp-label");
      if (tempLabel) tempLabel.textContent = temp + " K";
    }
  });

  grid.addEventListener("pointerdown", event => {
    const pad = event.target.closest(".wiz-sv-pad");
    if (!pad || !grid.contains(pad)) return;
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    pad.dataset.dragging = "1";
    const block = pad.closest(".wiz-rgb-controls");
    if (block) block.dataset.dragging = "1";
    wizApplySvPointer(block, event, false);
  });

  grid.addEventListener("pointermove", event => {
    const pad = event.target.closest(".wiz-sv-pad");
    if (!pad || pad.dataset.dragging !== "1") return;
    wizApplySvPointer(pad.closest(".wiz-rgb-controls"), event, false);
  });

  const endSvDrag = event => {
    const pad = event.target.closest(".wiz-sv-pad");
    if (!pad || pad.dataset.dragging !== "1") return;
    pad.dataset.dragging = "";
    const block = pad.closest(".wiz-rgb-controls");
    if (block) block.dataset.dragging = "";
    wizApplySvPointer(block, event, true);
  };
  grid.addEventListener("pointerup", endSvDrag);
  grid.addEventListener("pointercancel", endSvDrag);

  grid.addEventListener("click", event => {
    const roomOn = event.target.closest(".wiz-room-on");
    if (roomOn) {
      wizRoomCommand(roomOn.dataset.roomId, true);
      return;
    }
    const roomOff = event.target.closest(".wiz-room-off");
    if (roomOff) {
      wizRoomCommand(roomOff.dataset.roomId, false);
      return;
    }
    const btn = event.target.closest(".wiz-remove");
    if (!btn) return;
    wizConfiguredLights = wizConfiguredLights.filter(l => l.mac !== btn.dataset.mac);
    wizSaveConfig().then(() => wizRefreshLights());
  });
}

function wizRenderLightGrid(lights) {
  const grid = document.getElementById("wiz_light_grid");
  if (!grid) return;
  wizInitLightGrid();

  if (!lights.length) {
    grid.innerHTML = "<p class='wiz-empty' data-i18n-key='wiz-no-lights'>No lights configured yet. Scan and add bulbs above.</p>";
    return;
  }

  const existingCards = new Map();
  grid.querySelectorAll(".wiz-card").forEach(card => {
    if (card.dataset.mac) existingCards.set(card.dataset.mac, card);
  });

  const seenMacs = new Set();
  const seenRoomKeys = new Set();
  const groups = wizGroupLightsByRoom(lights);

  groups.forEach(([roomKey, roomLights]) => {
    const roomId = parseInt(roomKey, 10) || 0;
    seenRoomKeys.add(wizRoomSectionKey(roomId));
    const roomGrid = wizEnsureRoomSection(grid, roomId);

    roomLights.forEach(light => {
      seenMacs.add(light.mac);
      let card = existingCards.get(light.mac);
      if (card) {
        if (card.parentElement !== roomGrid) roomGrid.appendChild(card);
        wizUpdateLightCard(card, light);
      } else {
        roomGrid.appendChild(wizCreateLightCard(light));
      }
    });
  });

  existingCards.forEach((card, mac) => {
    if (!seenMacs.has(mac)) card.remove();
  });

  grid.querySelectorAll(".wiz-room").forEach(section => {
    const roomGrid = section.querySelector(".wiz-room-grid");
    if (!seenRoomKeys.has(section.dataset.roomKey)) {
      section.remove();
      return;
    }
    if (roomGrid && !roomGrid.querySelector(".wiz-card")) section.remove();
  });

  const empty = grid.querySelector(".wiz-empty");
  if (empty) empty.remove();
  wizApplyI18n(grid);
}

function wizRgbIsBusy(block) {
  if (!block) return false;
  if (block.dataset.dragging === "1") return true;
  const mac = block.dataset.mac;
  return !!(mac && wizRgbDebounce[mac]);
}

function wizPaintRgbPicker(block, r, g, b, keepHue) {
  if (!block) return;
  r = wizRgbChannel(r, 255);
  g = wizRgbChannel(g, 255);
  b = wizRgbChannel(b, 255);
  block.dataset.r = String(r);
  block.dataset.g = String(g);
  block.dataset.b = String(b);
  const hsv = wizRgbToHsv(r, g, b);
  let h = hsv.h;
  if (keepHue || hsv.s < 0.02) {
    const stored = parseFloat(block.dataset.h);
    if (!Number.isNaN(stored)) h = stored;
  }
  block.dataset.h = String(h);
  const cursor = block.querySelector(".wiz-sv-cursor");
  if (cursor) {
    cursor.style.left = ((h / 360) * 100).toFixed(1) + "%";
    cursor.style.top = (hsv.s * 100).toFixed(1) + "%";
  }
  const swatch = block.querySelector(".wiz-color-swatch");
  if (swatch) swatch.style.background = wizRgbToHex(r, g, b);
}

function wizSyncRgbInputs(block, r, g, b) {
  if (!block || wizRgbIsBusy(block)) return;
  wizPaintRgbPicker(block, r, g, b, false);
}

function wizReadRgbBlock(block) {
  if (!block) return { r: 255, g: 255, b: 255 };
  return {
    r: wizRgbChannel(block.dataset.r, 255),
    g: wizRgbChannel(block.dataset.g, 255),
    b: wizRgbChannel(block.dataset.b, 255)
  };
}

function wizRgbFromPad(block, clientX, clientY) {
  const pad = block && block.querySelector(".wiz-sv-pad");
  if (!pad) return wizReadRgbBlock(block);
  const rect = pad.getBoundingClientRect();
  const h = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360 : 0;
  const s = rect.height ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 1;
  block.dataset.h = String(h);
  return wizHsvToRgb(h, s, 1);
}

function wizPushRgb(block, rgb, commit) {
  if (!block || !rgb) return;
  wizPaintRgbPicker(block, rgb.r, rgb.g, rgb.b, true);
  const card = block.closest(".wiz-card");
  if (commit) wizSendRgb(block.dataset.mac, rgb.r, rgb.g, rgb.b, card);
  else wizSendRgbDebounced(block.dataset.mac, rgb.r, rgb.g, rgb.b, card);
}

function wizApplySvPointer(block, event, commit) {
  if (!block || !event) return;
  wizPushRgb(block, wizRgbFromPad(block, event.clientX, event.clientY), commit);
}

function wizOptimisticCard(card, payload) {
  if (!card) return;
  if (payload.on !== undefined) {
    card.classList.remove("wiz-off", "wiz-online", "wiz-offline");
    card.classList.add(payload.on ? "wiz-online" : "wiz-off");
    const badge = card.querySelector(".wiz-badge");
    if (badge) badge.textContent = wizStatusBadge({ online: true, on: payload.on });
  }
  if (payload.dimming !== undefined) {
    const dimPct = Math.round(payload.dimming * 100 / 255);
    wizSetInputValue(card.querySelector(".wiz-dim"), String(dimPct));
    const dimLabel = card.querySelector(".wiz-dim-label");
    if (dimLabel) dimLabel.textContent = dimPct + "%";
  }
  if (payload.r !== undefined) {
    const block = card.querySelector(".wiz-rgb-controls");
    wizSyncRgbInputs(block, payload.r, payload.g, payload.b);
  }
}

function wizCardDimming(card) {
  const dim = card && card.querySelector(".wiz-dim");
  if (!dim) return 255;
  return Math.round((parseInt(dim.value, 10) || 0) * 255 / 100);
}

function wizApplyCardRgb(card, payload) {
  if (!card || !card.querySelector(".wiz-rgb-controls")) return;
  const rgb = wizReadRgbBlock(card.querySelector(".wiz-rgb-controls"));
  payload.r = rgb.r;
  payload.g = rgb.g;
  payload.b = rgb.b;
}

function wizSendRgbDebounced(mac, r, g, b, card) {
  if (wizRgbDebounce[mac]) clearTimeout(wizRgbDebounce[mac]);
  const payload = { mac: mac, on: true, r: r, g: g, b: b, dimming: wizCardDimming(card) };
  wizOptimisticCard(card, payload);
  wizRgbDebounce[mac] = setTimeout(() => {
    delete wizRgbDebounce[mac];
    wizSendCommand(payload, card);
  }, WIZ_RGB_DEBOUNCE_MS);
}

function wizSendRgb(mac, r, g, b, card) {
  if (wizRgbDebounce[mac]) {
    clearTimeout(wizRgbDebounce[mac]);
    delete wizRgbDebounce[mac];
  }
  const payload = { mac: mac, on: true, r: r, g: g, b: b, dimming: wizCardDimming(card) };
  wizSendCommand(payload, card);
}

function wizSendTempDebounced(mac, temp, card) {
  if (wizCctDebounce[mac]) clearTimeout(wizCctDebounce[mac]);
  const payload = { mac: mac, on: true, temp: temp, dimming: wizCardDimming(card) };
  wizCctDebounce[mac] = setTimeout(() => {
    delete wizCctDebounce[mac];
    wizSendCommand(payload, card);
  }, WIZ_CCT_DEBOUNCE_MS);
}

function wizSendCommand(payload, card) {
  wizOptimisticCard(card, payload);
  return wizApi("/api/v2/wiz/command", "POST", payload)
    .then(json => {
      if (json && json.error) throw new Error(json.error);
      setTimeout(() => wizRefreshLights(true), WIZ_CMD_REFRESH_MS);
    })
    .catch(err => {
      wizSetStatus("Command failed: " + err, true);
      setTimeout(() => wizRefreshLights(true), WIZ_CMD_REFRESH_MS);
    });
}

function wizAllCommand(on) {
  wizSendCommand({ all: true, on: on });
}

function wizStartPagePolling() {
  if (wizPageTimer) clearInterval(wizPageTimer);
  if (!wizShouldPoll()) return;
  wizPageTimer = setInterval(() => wizRefreshLights(false), WIZ_PAGE_POLL_MS);
}

function wizStartPage() {
  wizStopPolling();
  wizInitLightGrid();
  wizBindScanTable();
  wizLoadConfig()
    .then(() => wizRefreshLights())
    .catch(err => wizSetStatus("Config load failed: " + err, true));
  wizStartPagePolling();
}

function wizResumePage() {
  if (activeTab !== "bWizLights") return;
  wizRefreshLights();
  wizStartPagePolling();
}
