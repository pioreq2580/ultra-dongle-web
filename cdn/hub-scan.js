let hubScanTimer = null;
let hubScanAssigned = { helty: "", wiz: [], eurom: "" };
let hubScanStartedAt = 0;
const HUB_SCAN_POLL_MS = 400;
const HUB_SCAN_LISTEN_MS = 2500;

function hubScanT(key, fallback) {
  return (typeof t === "function" && t(key)) || fallback;
}

function hubScanApi(path, method, body) {
  const opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(APIHOST + path, opts).then(async r => {
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    if (!r.ok) {
      const err = new Error((json && json.error) || text || ("HTTP " + r.status));
      err.status = r.status;
      throw err;
    }
    if (!json) throw new Error("Invalid JSON from device");
    return json;
  });
}

function hubScanPane() {
  return document.querySelector("#HubDevices .hub-scan-pane");
}

function hubScanVisibleProgress(apiProgress) {
  const reported = Math.max(0, Number(apiProgress) || 0);
  if (!hubScanStartedAt) return reported;
  const listenGuess = Math.min(70, Math.round(((Date.now() - hubScanStartedAt) / HUB_SCAN_LISTEN_MS) * 70));
  return Math.max(reported, listenGuess);
}

function hubScanSetProgress(percent, mode) {
  const pane = hubScanPane();
  const fill = document.getElementById("hub_scan_fill");
  const track = document.getElementById("hub_scan_track");
  if (!pane || !fill) return;
  const scanning = mode === "scan";
  const raw = scanning ? hubScanVisibleProgress(percent) : (Number(percent) || 0);
  const pct = Math.max(0, Math.min(100, raw));
  pane.classList.toggle("is-scanning", scanning);
  fill.style.width = (scanning ? pct : 0) + "%";
  if (track) track.hidden = !scanning;
}

function hubScanSetStatus(text, isError, options) {
  const el = document.getElementById("hub_scan_status");
  if (!el) return;
  el.textContent = text || "";
  el.className = "helty-status" + (isError ? " helty-error" : "");
  const opts = options || {};
  const mode = opts.mode || (isError ? "error" : "idle");
  hubScanSetProgress(opts.progress, mode);
}

function hubScanEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hubScanStopPolling() {
  if (hubScanTimer) {
    clearInterval(hubScanTimer);
    hubScanTimer = null;
  }
  const btn = document.getElementById("hub_scan_btn");
  if (btn) btn.disabled = false;
}

function hubScanEmpty(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "<p class='settings-help'>" + hubScanEscape(message) + "</p>";
}

function hubScanItem(title, detail, actionLabel, assigned, onClick) {
  const row = document.createElement("div");
  row.className = "hub-scan-item";
  const meta = document.createElement("div");
  meta.innerHTML = "<strong>" + hubScanEscape(title) + "</strong>" +
    (detail ? "<div class='hub-scan-detail'>" + hubScanEscape(detail) + "</div>" : "");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.textContent = assigned
    ? hubScanT("hub-scan-assigned", "Assigned")
    : actionLabel;
  btn.disabled = !!assigned;
  if (!assigned) btn.onclick = onClick;
  row.appendChild(meta);
  row.appendChild(btn);
  return row;
}

function hubScanRender(json) {
  const heltyBox = document.getElementById("hub_scan_helty");
  const wizBox = document.getElementById("hub_scan_wiz");
  const euromBox = document.getElementById("hub_scan_eurom");
  if (!heltyBox || !wizBox || !euromBox) return;

  const helty = json.helty || [];
  const wiz = json.wiz || [];
  const eurom = json.eurom || [];

  heltyBox.innerHTML = "";
  if (!helty.length) {
    hubScanEmpty("hub_scan_helty", hubScanT("hub-scan-none", "Nothing found yet."));
  } else {
    helty.forEach(item => {
      const assigned = hubScanAssigned.helty && hubScanAssigned.helty === item.host;
      heltyBox.appendChild(hubScanItem(
        item.name || item.host,
        item.host,
        hubScanT("hub-scan-assign", "Assign"),
        assigned,
        () => hubScanAssignHelty(item)
      ));
    });
  }

  wizBox.innerHTML = "";
  if (!wiz.length) {
    hubScanEmpty("hub_scan_wiz", hubScanT("hub-scan-none", "Nothing found yet."));
  } else {
    wiz.forEach(item => {
      const assigned = (hubScanAssigned.wiz || []).indexOf(item.mac) >= 0;
      const detail = [item.ip, item.mac, item.room_id ? ("room " + item.room_id) : ""]
        .filter(Boolean).join(" · ");
      wizBox.appendChild(hubScanItem(
        item.name || item.mac || item.ip,
        detail,
        hubScanT("hub-scan-assign", "Assign"),
        assigned,
        () => hubScanAssignWiz(item)
      ));
    });
  }

  euromBox.innerHTML = "";
  if (!eurom.length) {
    hubScanEmpty("hub_scan_eurom", hubScanT("hub-scan-none", "Nothing found yet."));
  } else {
    eurom.forEach(item => {
      const assigned = hubScanAssigned.eurom && hubScanAssigned.eurom === item.host;
      const detail = [item.host, item.device_id, item.version].filter(Boolean).join(" · ");
      euromBox.appendChild(hubScanItem(
        item.device_id || item.host,
        detail,
        hubScanT("hub-scan-assign", "Assign"),
        assigned,
        () => hubScanAssignEurom(item)
      ));
    });
  }
}

function hubScanPhaseText(json) {
  if (json.scan_phase === "udp") return hubScanT("hub-scan-udp", "Listening…");
  if (json.scan_phase === "known") return hubScanT("hub-scan-known", "Checking saved devices…");
  if (json.scan_phase === "tcp") return hubScanT("hub-scan-progress", "Scanning…");
  return hubScanT("hub-scan-progress", "Scanning…");
}

function hubScanHasResults(json) {
  return !!(json.helty && json.helty.length) ||
    !!(json.wiz && json.wiz.length) ||
    !!(json.eurom && json.eurom.length);
}

function hubScanFinishedStatus(json) {
  if (json.phase === 3) {
    hubScanSetStatus(json.error || hubScanT("hub-scan-failed", "Scan failed"), true, { mode: "error", progress: 100 });
    return;
  }
  const counts = json.counts || {};
  const total = (counts.helty || 0) + (counts.wiz || 0) + (counts.eurom || 0);
  hubScanSetStatus(total
    ? hubScanT("hub-scan-done", "Scan complete.")
    : hubScanT("hub-scan-empty", "Scan complete — no devices found."), false, { mode: "idle", progress: 0 });
}

function hubScanApplyState(json) {
  hubScanRender(json);
  if (json.phase === 1) {
    if (!hubScanStartedAt) hubScanStartedAt = Date.now();
    hubScanSetStatus(hubScanPhaseText(json), false, { mode: "scan", progress: json.progress || 2 });
    const btn = document.getElementById("hub_scan_btn");
    if (btn) btn.disabled = true;
    if (!hubScanTimer) hubScanTimer = setInterval(hubScanPoll, HUB_SCAN_POLL_MS);
    return;
  }
  hubScanStopPolling();
  hubScanStartedAt = 0;
  if (json.phase === 2 || json.phase === 3 || hubScanHasResults(json)) hubScanFinishedStatus(json);
}

function hubScanFollowExisting() {
  return hubScanApi("/api/v2/hubs/scan").then(hubScanApplyState);
}

function hubScanPoll() {
  hubScanFollowExisting().catch(err => {
    hubScanStopPolling();
    hubScanSetStatus(hubScanT("hub-scan-failed", "Scan failed") + ": " + (err.message || err), true);
  });
}

function hubScanLoadAssigned() {
  return Promise.all([
    hubScanApi("/api/v2/helty/config").catch(() => ({})),
    hubScanApi("/api/v2/wiz/config").catch(() => ({})),
    hubScanApi("/api/v2/eurom/config").catch(() => ({}))
  ]).then(([helty, wiz, eurom]) => {
    hubScanAssigned.helty = helty.host || "";
    hubScanAssigned.wiz = (wiz.lights || []).map(item => item.mac).filter(Boolean);
    hubScanAssigned.eurom = eurom.host || "";
  });
}

function hubScanStartPage() {
  hubScanEmpty("hub_scan_helty", hubScanT("hub-scan-none", "Nothing found yet."));
  hubScanEmpty("hub_scan_wiz", hubScanT("hub-scan-none", "Nothing found yet."));
  hubScanEmpty("hub_scan_eurom", hubScanT("hub-scan-none", "Nothing found yet."));
  hubScanLoadAssigned()
    .then(hubScanFollowExisting)
    .catch(() => {});
}

function hubScanStart() {
  if (hubScanTimer) {
    hubScanPoll();
    return;
  }
  const btn = document.getElementById("hub_scan_btn");
  if (btn) btn.disabled = true;
  hubScanStartedAt = Date.now();
  hubScanSetStatus(hubScanT("hub-scan-starting", "Starting network scan…"), false, { mode: "scan", progress: 2 });
  hubScanApi("/api/v2/hubs/scan", "POST", {})
    .then(() => {
      if (btn) btn.disabled = true;
      if (!hubScanTimer) hubScanTimer = setInterval(hubScanPoll, HUB_SCAN_POLL_MS);
      hubScanPoll();
    })
    .catch(err => {
      if (err.status === 409) {
        hubScanFollowExisting().catch(() => {
          if (btn) btn.disabled = false;
          hubScanSetStatus(hubScanT("hub-scan-done", "Scan complete."), false, { mode: "idle", progress: 0 });
        });
        return;
      }
      if (btn) btn.disabled = false;
      hubScanSetStatus(err.message || String(err), true);
    });
}

function hubScanAssignHelty(item) {
  hubScanSetStatus(hubScanT("hub-scan-saving", "Assigning…"), false);
  hubScanApi("/api/v2/helty/config", "POST", {
    enabled: true,
    host: item.host,
    port: 5001
  })
    .then(() => {
      hubScanAssigned.helty = item.host;
      hubScanSetStatus(hubScanT("hub-scan-assigned-helty", "Assigned to Air Guard."), false);
      location.hash = "HeltyManagement";
    })
    .catch(err => hubScanSetStatus("Assign failed: " + err, true));
}

function hubScanAssignWiz(item) {
  hubScanSetStatus(hubScanT("hub-scan-saving", "Assigning…"), false);
  hubScanApi("/api/v2/wiz/config")
    .then(cfg => {
      const lights = (cfg.lights || []).filter(light => light.mac !== item.mac);
      lights.push({
        mac: item.mac,
        ip: item.ip || "",
        name: item.name || item.mac,
        room: item.room || "",
        room_id: item.room_id || 0,
        enabled: true
      });
      const rooms = cfg.rooms || [];
      if (item.room_id) {
        const room = rooms.find(entry => entry.id === item.room_id);
        if (room && item.room) room.name = item.room;
        else if (item.room) rooms.push({ id: item.room_id, name: item.room });
      }
      return hubScanApi("/api/v2/wiz/config", "POST", {
        enabled: true,
        poll_sec: cfg.poll_sec || 30,
        rooms: rooms,
        lights: lights
      });
    })
    .then(() => {
      if (item.mac && hubScanAssigned.wiz.indexOf(item.mac) < 0) hubScanAssigned.wiz.push(item.mac);
      hubScanSetStatus(hubScanT("hub-scan-assigned-wiz", "Assigned to WiZ."), false);
      location.hash = "WizLights";
    })
    .catch(err => hubScanSetStatus("Assign failed: " + err, true));
}

function hubScanAssignEurom(item) {
  hubScanSetStatus(hubScanT("hub-scan-saving", "Assigning…"), false);
  hubScanApi("/api/v2/eurom/config")
    .then(cfg => hubScanApi("/api/v2/eurom/config", "POST", {
      enabled: true,
      host: item.host,
      port: cfg.port || 6668,
      poll_interval_sec: cfg.poll_interval_sec || 30,
      name: cfg.name || "",
      device_id: item.device_id || cfg.device_id || "",
      protocol: item.version || cfg.protocol || "3.3"
    }))
    .then(() => {
      hubScanAssigned.eurom = item.host;
      const hostEl = document.getElementById("eurom_host");
      const idEl = document.getElementById("eurom_device_id");
      if (hostEl) hostEl.value = item.host || "";
      if (idEl && item.device_id) idEl.value = item.device_id;
      hubScanSetStatus(hubScanT("hub-scan-assigned-eurom", "Assigned to EUROM. Add the local key if needed."), false);
      location.hash = "EuromManagement";
    })
    .catch(err => hubScanSetStatus("Assign failed: " + err, true));
}
