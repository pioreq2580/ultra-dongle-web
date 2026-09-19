let heltyTestTimer = null;
let heltyCommandTimer = null;
let heltyCommandStartedAt = 0;
let heltyManagementTimer = null;
let heltyUiState = { fan_mode: null, led: false };
let heltyLastLiveKey = "";
const HELTY_LIVE_MS = 1000;
const HELTY_CMD_POLL_MS = 400;
const HELTY_CMD_TIMEOUT_MS = 15000;
const HELTY_CMD_IDLE = 0;
const HELTY_CMD_RUNNING = 1;
const HELTY_CMD_DONE = 2;
const HELTY_CMD_ERROR = 3;

function heltyApi(path, method, body) {
  const opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(APIHOST + path, opts).then(async r => {
    const text = await r.text();
    if (!r.ok) throw new Error(text || ("HTTP " + r.status));
    try { return JSON.parse(text); }
    catch { throw new Error("Invalid JSON from device"); }
  });
}

function heltySetStatus(elId, text, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "helty-status" + (isError ? " helty-error" : "");
}

function heltyEscapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fetchHeltyConfig() {
  return heltyApi("/api/v2/helty/config").then(json => {
    document.getElementById("helty_host").value = json.host || "";
    document.getElementById("helty_port").value = json.port || 5001;
    const poll = document.getElementById("helty_poll");
    if (poll) poll.value = json.poll_interval_sec || 30;
    document.getElementById("helty_enabled").checked = !!json.enabled;
    return json;
  }).catch(err => console.error("Helty config load failed", err));
}

function heltySave() {
  const payload = {
    enabled: document.getElementById("helty_enabled").checked,
    host: document.getElementById("helty_host").value.trim(),
    port: parseInt(document.getElementById("helty_port").value, 10) || 5001,
    poll_interval_sec: parseInt((document.getElementById("helty_poll") || {}).value, 10) || 30
  };
  heltyApi("/api/v2/helty/config", "POST", payload)
    .then(() => {
      heltySetStatus("helty_discover_status", "Saved.", false);
      if (payload.host) heltyTest();
    })
    .catch(err => heltySetStatus("helty_discover_status", "Save failed: " + err, true));
}

function heltyTest() {
  const host = document.getElementById("helty_host").value.trim();
  const port = parseInt(document.getElementById("helty_port").value, 10) || 5001;
  if (!host) {
    heltySetStatus("helty_discover_status", "Enter a host or IP.", true);
    return;
  }
  heltySetStatus("helty_discover_status", "Testing…", false);
  heltyApi("/api/v2/helty/discover", "POST", { mode: "test", host, port })
    .then(() => {
      if (heltyTestTimer) clearInterval(heltyTestTimer);
      heltyTestTimer = setInterval(heltyPollTestStatus, 400);
      heltyPollTestStatus();
    })
    .catch(err => heltySetStatus("helty_discover_status", "Test failed: " + err, true));
}

function heltyPollTestStatus() {
  heltyApi("/api/v2/helty/discover")
    .then(json => {
      if (json.phase === 1) return;
      if (heltyTestTimer) { clearInterval(heltyTestTimer); heltyTestTimer = null; }
      if (json.phase === 3 && json.test_host) {
        heltySetStatus("helty_discover_status", "Connected: " + (json.test_name || json.test_host), false);
      } else {
        heltySetStatus("helty_discover_status", json.error || "Connection failed", true);
      }
    })
    .catch(err => {
      if (heltyTestTimer) { clearInterval(heltyTestTimer); heltyTestTimer = null; }
      heltySetStatus("helty_discover_status", "Test failed: " + err, true);
    });
}

function heltyFormatValue(label, value, unit) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="card"><h1>${label}</h1><h2>${value}${unit ? " " + unit : ""}</h2></div>`;
}

function heltyFormatDisplayName(name) {
  if (!name) return "";
  return String(name).trim().split(/[\s_]+/).filter(Boolean).map(word => {
    if (word.length <= 3) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

function heltyBuildDeviceLine(json) {
  const displayName = heltyFormatDisplayName(json.name);
  const host = json.host || "";
  if (displayName && host) return heltyEscapeHtml(displayName) + " · " + heltyEscapeHtml(host);
  return heltyEscapeHtml(displayName || host);
}

function heltyUpdateStatusBadge(json) {
  const statusEl = document.getElementById("helty_status_badge");
  if (!statusEl) return;
  let stateClass, icon, label, deviceLine = "";
  if (!json.enabled) {
    stateClass = "helty-warn";
    icon = "mdi-power-off";
    label = t("helty-status-hub-disabled");
  } else if (json.connected) {
    stateClass = "helty-ok";
    icon = "mdi-check-circle";
    label = t("helty-status-online");
    deviceLine = heltyBuildDeviceLine(json);
  } else if (json.valid) {
    stateClass = "helty-warn";
    icon = "mdi-clock-alert-outline";
    label = t("helty-status-stale");
    deviceLine = heltyBuildDeviceLine(json);
  } else {
    stateClass = "helty-error";
    icon = "mdi-lan-disconnect";
    label = t("helty-status-offline");
    if (json.host) deviceLine = heltyEscapeHtml(json.host);
  }
  statusEl.className = "helty-status-bar " + stateClass;
  statusEl.innerHTML =
    `<span class="iconify helty-status-icon" data-icon="${icon}"></span>` +
    `<div class="helty-status-text">` +
      `<div class="helty-status-label">${heltyEscapeHtml(label)}</div>` +
      (deviceLine ? `<div class="helty-status-device">${deviceLine}</div>` : "") +
    `</div>`;
  if (window.Iconify && Iconify.scan) Iconify.scan(statusEl);
}

function heltyLiveKey(json) {
  return [json.connected, json.fan_mode, json.led, json.indoor_temperature, json.outdoor_temperature,
    json.indoor_humidity, json.co2, json.voc, json.filter_hours].join("|");
}

function heltyUpdateTelemetryGrid(json) {
  const grid = document.getElementById("helty_telemetry");
  if (!grid) return;
  const key = heltyLiveKey(json);
  if (key === heltyLastLiveKey && grid.innerHTML) return;
  heltyLastLiveKey = key;
  let html = "";
  html += heltyFormatValue(t("helty-tx-fan-mode"), json.fan_mode);
  html += heltyFormatValue(t("helty-tx-indoor-temp"), json.indoor_temperature, "\u00b0C");
  html += heltyFormatValue(t("helty-tx-outdoor-temp"), json.outdoor_temperature, "\u00b0C");
  html += heltyFormatValue(t("helty-tx-humidity"), json.indoor_humidity, "%");
  if (json.co2 > 0) html += heltyFormatValue(t("helty-tx-co2"), json.co2, "ppm");
  if (json.voc > 0) html += heltyFormatValue(t("helty-tx-voc"), json.voc, "ppb");
  if (json.filter_hours) html += heltyFormatValue(t("helty-tx-filter-hours"), json.filter_hours);
  grid.innerHTML = html || `<div class="helty-status">${t("helty-tx-none")}</div>`;
}

function heltySeedUiState(json) {
  if (json.fan_mode) heltyUiState.fan_mode = json.fan_mode;
  if (json.led !== undefined) heltyUiState.led = !!json.led;
  heltyRenderControlGrid();
}

function heltyRenderControlGrid() {
  const grid = document.getElementById("helty_ctrl_grid");
  if (!grid) return;
  grid.querySelectorAll("[data-fan-mode]").forEach(btn => {
    btn.classList.toggle("helty-ctrl-active", btn.dataset.fanMode === heltyUiState.fan_mode);
  });
  const ledBtn = grid.querySelector('[data-action="led"]');
  if (ledBtn) ledBtn.classList.toggle("helty-ctrl-active", !!heltyUiState.led);
}

function heltyRefreshManagement() {
  return heltyApi("/api/v2/helty/live").then(json => {
    heltyUpdateStatusBadge(json);
    heltyUpdateTelemetryGrid(json);
    if (!heltyCommandTimer) heltySeedUiState(json);
    return json;
  }).catch(err => heltySetStatus("helty_manage_message", "Refresh failed: " + err, true));
}

function heltySendFanMode(mode) {
  if (!mode || heltyCommandTimer) return;
  heltyUiState.fan_mode = mode;
  heltyRenderControlGrid();
  heltyStartCommand({ fan_mode: mode }, "Updated.", "Command failed");
}

function heltySendLed() {
  if (heltyCommandTimer) return;
  heltyUiState.led = !heltyUiState.led;
  heltyRenderControlGrid();
  heltyStartCommand({ led: heltyUiState.led }, "Updated.", "Command failed");
}

function heltySendResetFilter() {
  if (heltyCommandTimer) return;
  if (!window.confirm(t("helty-reset-filter-confirm") || "Reset filter counter?")) return;
  heltyStartCommand({ reset_filter: true }, "Filter reset.", "Reset failed");
}

function heltyFinishCommand(successMsg, failureMsg, isError) {
  if (heltyCommandTimer) clearInterval(heltyCommandTimer);
  heltyCommandTimer = null;
  heltyCommandStartedAt = 0;
  heltySetStatus("helty_manage_message", isError ? failureMsg : "", isError);
  heltyRefreshManagement();
}

function heltyPollCommandStatus(successMsg, failurePrefix) {
  if (heltyCommandStartedAt && (Date.now() - heltyCommandStartedAt) > HELTY_CMD_TIMEOUT_MS) {
    heltyFinishCommand(successMsg, failurePrefix + " (timeout)", true);
    return;
  }
  heltyApi("/api/v2/helty/command")
    .then(json => {
      if (json.phase === HELTY_CMD_RUNNING) return;
      if (json.phase === HELTY_CMD_DONE && json.ok) heltyFinishCommand(successMsg, failurePrefix, false);
      else if (json.phase === HELTY_CMD_ERROR || (json.phase === HELTY_CMD_DONE && !json.ok)) {
        heltyFinishCommand(successMsg, json.error || failurePrefix, true);
      }
    })
    .catch(err => heltyFinishCommand(successMsg, failurePrefix + ": " + err, true));
}

function heltyStartCommand(payload, successMsg, failurePrefix) {
  heltyApi("/api/v2/helty/command", "POST", payload)
    .then(() => {
      if (heltyCommandTimer) clearInterval(heltyCommandTimer);
      heltyCommandStartedAt = Date.now();
      heltyCommandTimer = setInterval(() => heltyPollCommandStatus(successMsg, failurePrefix), HELTY_CMD_POLL_MS);
      heltyPollCommandStatus(successMsg, failurePrefix);
    })
    .catch(err => {
      heltySetStatus("helty_manage_message", failurePrefix + ": " + err, true);
    });
}

function heltyStartManagement() {
  fetchHeltyConfig();
  heltyRefreshManagement();
  if (heltyManagementTimer) clearInterval(heltyManagementTimer);
  heltyManagementTimer = setInterval(heltyRefreshManagement, HELTY_LIVE_MS);
}

function heltyStopManagementPolling() {
  if (heltyManagementTimer) {
    clearInterval(heltyManagementTimer);
    heltyManagementTimer = null;
  }
  if (heltyTestTimer) {
    clearInterval(heltyTestTimer);
    heltyTestTimer = null;
  }
}

function initHeltyControlGrid() {
  const grid = document.getElementById("helty_ctrl_grid");
  if (!grid || grid.dataset.bound) return;
  grid.dataset.bound = "1";
  grid.addEventListener("click", event => {
    const btn = event.target.closest(".helty-ctrl-btn");
    if (!btn || btn.disabled) return;
    const mode = btn.dataset.fanMode;
    const action = btn.dataset.action;
    if (mode) heltySendFanMode(mode);
    else if (action === "led") heltySendLed();
    else if (action === "reset-filter") heltySendResetFilter();
  });
}

function heltyScan() {
  location.hash = "HubDevices";
}

function heltyStartDiscover() {
  fetchHeltyConfig();
}
