function euromApi(path, method, body) {
  const opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(APIHOST + path, opts).then(async r => {
    const text = await r.text();
    if (!r.ok) throw new Error(text || ("HTTP " + r.status));
    try { return JSON.parse(text); }
    catch { throw new Error("Invalid JSON from device"); }
  });
}

function euromSetStatus(elId, text, isError) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "helty-status" + (isError ? " helty-error" : "");
}

function fetchEuromConfig() {
  return euromApi("/api/v2/eurom/config").then(json => {
    document.getElementById("eurom_host").value = json.host || "";
    document.getElementById("eurom_port").value = json.port || 6668;
    document.getElementById("eurom_poll").value = json.poll_interval_sec || 30;
    document.getElementById("eurom_enabled").checked = !!json.enabled;
    document.getElementById("eurom_name").value = json.name || "";
    document.getElementById("eurom_device_id").value = json.device_id || "";
    document.getElementById("eurom_protocol").value = json.protocol || "3.3";
    const hint = document.getElementById("eurom_key_hint");
    if (hint) hint.textContent = json.local_key_set ? t("eurom-key-set") : t("eurom-key-missing");
    return json;
  }).catch(err => {
    console.error("EUROM config load failed", err);
  });
}

function euromSave() {
  const payload = {
    enabled: document.getElementById("eurom_enabled").checked,
    host: document.getElementById("eurom_host").value.trim(),
    port: parseInt(document.getElementById("eurom_port").value, 10) || 6668,
    poll_interval_sec: parseInt(document.getElementById("eurom_poll").value, 10) || 30,
    name: document.getElementById("eurom_name").value.trim(),
    device_id: document.getElementById("eurom_device_id").value.trim(),
    protocol: document.getElementById("eurom_protocol").value || "3.3"
  };
  const key = document.getElementById("eurom_local_key").value.trim();
  if (key) payload.local_key = key;
  euromApi("/api/v2/eurom/config", "POST", payload)
    .then(() => {
      document.getElementById("eurom_local_key").value = "";
      euromSetStatus("eurom_discover_status", t("eurom-saved"), false);
      fetchEuromConfig();
      if (payload.host) euromTest();
    })
    .catch(err => euromSetStatus("eurom_discover_status", "Save failed: " + err, true));
}

function euromTest() {
  const host = document.getElementById("eurom_host").value.trim();
  const port = parseInt(document.getElementById("eurom_port").value, 10) || 6668;
  if (!host) {
    euromSetStatus("eurom_discover_status", t("eurom-host-required"), true);
    return;
  }
  euromSetStatus("eurom_discover_status", t("eurom-testing"), false);
  euromApi("/api/v2/eurom/discover", "POST", { mode: "test", host, port })
    .then(() => {
      if (euromTestTimer) clearInterval(euromTestTimer);
      euromTestTimer = setInterval(euromPollTestStatus, 2000);
      euromPollTestStatus();
    })
    .catch(err => euromSetStatus("eurom_discover_status", "Test failed: " + err, true));
}

function euromPollTestStatus() {
  euromApi("/api/v2/eurom/discover")
    .then(json => {
      if (json.phase === 1) {
        euromSetStatus("eurom_discover_status", t("eurom-testing"), false);
      } else if (json.phase === 3 && json.test_host) {
        clearInterval(euromTestTimer);
        euromTestTimer = null;
        const extra = json.test_device_id ? " (" + json.test_device_id + ")" : "";
        const warn = json.error ? " â€” " + json.error : "";
        euromSetStatus("eurom_discover_status", t("eurom-test-ok") + extra + warn, false);
      } else if (json.phase === 4 && json.test_host) {
        clearInterval(euromTestTimer);
        euromTestTimer = null;
        euromSetStatus("eurom_discover_status", json.error || t("eurom-test-fail"), true);
      }
    })
    .catch(err => {
      clearInterval(euromTestTimer);
      euromTestTimer = null;
      euromSetStatus("eurom_discover_status", "Test failed: " + err, true);
    });
}

function euromSetDiscoverButtonsDisabled(disabled) {
  document.querySelectorAll("#EuromDiscover button").forEach(btn => {
    btn.disabled = !!disabled;
  });
}

function euromStopDiscoverPolling() {
  if (euromScanTimer) {
    clearInterval(euromScanTimer);
    euromScanTimer = null;
  }
  if (euromScanTimeoutTimer) {
    clearTimeout(euromScanTimeoutTimer);
    euromScanTimeoutTimer = null;
  }
  if (euromTestTimer) {
    clearInterval(euromTestTimer);
    euromTestTimer = null;
  }
  euromSetDiscoverButtonsDisabled(false);
}

function euromFinishScan(message, isError) {
  euromStopDiscoverPolling();
  euromSetStatus("eurom_scan_progress", message, isError);
}

function euromSelectResult(item) {
  if (!item) return;
  if (item.host) document.getElementById("eurom_host").value = item.host;
  if (item.device_id) document.getElementById("eurom_device_id").value = item.device_id;
  const ver = String(item.version || "");
  if (ver.indexOf("3.5") === 0) document.getElementById("eurom_protocol").value = "3.5";
  else if (ver.indexOf("3.4") === 0) document.getElementById("eurom_protocol").value = "3.4";
  else if (ver.indexOf("3.3") === 0 || ver.indexOf("3.1") === 0 || ver.indexOf("3.2") === 0) {
    document.getElementById("eurom_protocol").value = "3.3";
  }
  euromSetStatus("eurom_discover_status", t("eurom-selected") + " " + (item.host || "") + (item.device_id ? " / " + item.device_id : ""), false);
}

function euromRenderScanResults(results) {
  const table = document.getElementById("eurom_scan_results");
  const body = document.getElementById("eurom_scan_results_body");
  if (!table || !body) return;
  body.innerHTML = "";
  if (!results || !results.length) {
    table.style.display = "none";
    return;
  }
  results.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${item.host || "-"}</td><td>${item.device_id || "-"}</td><td>${item.version || item.source || "-"}</td><td><button type="button">Select</button></td>`;
    row.querySelector("button").onclick = () => euromSelectResult(item);
    body.appendChild(row);
  });
  table.style.display = "";
}

function euromPollScanStatus() {
  euromApi("/api/v2/eurom/discover")
    .then(json => {
      if (json.phase === 0) {
        euromSetStatus("eurom_scan_progress", t("eurom-scan-queued"), false);
      } else if (json.phase === 1) {
        euromFinishScan(t("eurom-busy"), true);
      } else if (json.phase === 2) {
        const partial = json.results || [];
        if (partial.length) euromRenderScanResults(partial);
        const foundNote = partial.length
          ? " â€” " + partial.length + " " + t("eurom-found")
          : "";
        euromSetStatus("eurom_scan_progress", t("eurom-scanning") + " " + (json.progress || 0) + "%" + foundNote, false);
      } else if (json.phase === 3) {
        const results = json.results || [];
        euromFinishScan(results.length ? t("eurom-scan-done") : t("eurom-scan-empty"), false);
        euromRenderScanResults(results);
        if (results.length === 1) euromSelectResult(results[0]);
      } else if (json.phase === 4) {
        euromFinishScan(json.error || t("eurom-scan-fail"), true);
      }
    })
    .catch(err => {
      euromFinishScan("Scan status failed: " + err, true);
    });
}

function euromScan() {
  if (euromScanTimer) return;
  euromSetStatus("eurom_scan_progress", t("eurom-scan-start"), false);
  document.getElementById("eurom_scan_results").style.display = "none";
  euromSetDiscoverButtonsDisabled(true);
  euromApi("/api/v2/eurom/discover", "POST", { mode: "scan" })
    .then(() => {
      euromStopDiscoverPolling();
      euromSetDiscoverButtonsDisabled(true);
      euromScanTimer = setInterval(euromPollScanStatus, EUROM_SCAN_POLL_MS);
      euromPollScanStatus();
      euromScanTimeoutTimer = setTimeout(() => {
        if (euromScanTimer) euromFinishScan(t("eurom-scan-timeout"), true);
      }, EUROM_SCAN_TIMEOUT_MS);
    })
    .catch(err => {
      euromFinishScan("Scan start failed: " + err, true);
    });
}

function euromEscapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function euromUpdateStatusBadge(json) {
  const statusEl = document.getElementById("eurom_status_badge");
  if (!statusEl) return;
  let stateClass;
  let icon;
  let label;
  let deviceLine = "";
  if (!json.enabled) {
    stateClass = "helty-warn";
    icon = "mdi-power-off";
    label = t("eurom-status-hub-disabled");
  } else if (json.connected) {
    stateClass = "helty-ok";
    icon = "mdi-check-circle";
    label = t("eurom-status-online");
    deviceLine = euromEscapeHtml(json.name || json.host || "");
  } else if (json.valid) {
    stateClass = "helty-warn";
    icon = "mdi-clock-alert-outline";
    label = t("eurom-status-stale");
    if (json.last_poll_age_sec !== undefined) label += " (" + json.last_poll_age_sec + "s)";
    deviceLine = euromEscapeHtml(json.name || json.host || "");
  } else {
    stateClass = "helty-error";
    icon = "mdi-lan-disconnect";
    label = t("eurom-status-offline");
    if (json.host) deviceLine = euromEscapeHtml(json.host);
    if (json.error) deviceLine = (deviceLine ? deviceLine + " Â· " : "") + euromEscapeHtml(json.error);
  }
  statusEl.className = "helty-status-bar " + stateClass;
  statusEl.innerHTML =
    `<span class="iconify helty-status-icon" data-icon="${icon}"></span>` +
    `<div class="helty-status-text">` +
      `<div class="helty-status-label">${euromEscapeHtml(label)}</div>` +
      (deviceLine ? `<div class="helty-status-device">${deviceLine}</div>` : "") +
    `</div>`;
  if (window.Iconify && Iconify.scan) Iconify.scan(statusEl);
}

function euromUpdateTelemetryGrid(json) {
  const grid = document.getElementById("eurom_telemetry");
  if (!grid) return;
  const dash = t("eurom-none");
  const card = (label, value, unit) => {
    const empty = value === undefined || value === null || value === "";
    const shown = empty ? dash : value;
    return `<div class="card"><h1>${euromEscapeHtml(label)}</h1><h2>${euromEscapeHtml(shown)}${!empty && unit ? " " + unit : ""}</h2></div>`;
  };
  let html = "";
  html += card(t("eurom-tx-connected"), json.connected ? t("eurom-status-online") : t("eurom-status-offline"));
  html += card(t("eurom-tx-on"), json.on ? t("eurom-on") : t("eurom-off"));
  html += card(t("eurom-tx-setpoint"), json.setpoint_c, "Â°C");
  html += card(t("eurom-tx-temp"), json.temperature_c, "Â°C");
  if (json.unit_f) html += card(t("eurom-tx-unit"), "Â°F");
  html += card(t("eurom-tx-timer"), json.timer_min, "min");
  html += card(t("eurom-tx-timer-on"), json.timer_on === undefined ? "" : (json.timer_on ? t("eurom-on") : t("eurom-off")));
  html += card(t("eurom-tx-schedule"), json.schedule_mode);
  if (json.last_poll_age_sec !== undefined) html += card(t("eurom-tx-last-poll"), json.last_poll_age_sec, "s");
  else html += card(t("eurom-tx-last-poll"), json.last_poll);
  html += card(t("eurom-tx-error"), json.error);
  grid.innerHTML = html || `<div class="helty-status">${t("eurom-tx-none")}</div>`;
}

function euromRefreshLive() {
  const refreshBtn = document.getElementById("eurom_refresh_btn");
  if (refreshBtn) refreshBtn.disabled = true;
  return euromApi("/api/v2/eurom/live").then(json => {
    if (!euromCommandTimer) euromSetStatus("eurom_manage_message", "", false);
    euromUpdateStatusBadge(json);
    euromUpdateTelemetryGrid(json);
    euromSeedUiState(json);
    return json;
  }).catch(err => {
    euromSetStatus("eurom_manage_message", "Refresh failed: " + err, true);
  }).finally(() => {
    if (refreshBtn) refreshBtn.disabled = false;
  });
}

function euromSeedUiState(json) {
  if (json && json.on !== undefined) euromUiState.on = !!json.on;
  if (json && json.setpoint_c !== undefined && json.setpoint_c !== null) {
    euromUiState.setpoint_c = parseInt(json.setpoint_c, 10);
  }
  euromRenderControls();
}

function euromRenderControls() {
  document.querySelectorAll("#eurom_ctrl_grid [data-action]").forEach(btn => {
    const action = btn.dataset.action;
    btn.classList.toggle("helty-ctrl-active",
      (action === "on" && euromUiState.on) || (action === "off" && !euromUiState.on));
  });
  const valueEl = document.getElementById("eurom_setpoint_value");
  if (valueEl) {
    valueEl.textContent = Number.isFinite(euromUiState.setpoint_c)
      ? euromUiState.setpoint_c + " Â°C"
      : "â€”";
  }
}

function euromSetControlsDisabled(disabled) {
  document.querySelectorAll("#eurom_ctrl_grid .helty-ctrl-btn, .eurom-setpoint-btn").forEach(btn => {
    btn.disabled = !!disabled;
  });
}

function euromFinishCommand(successMsg, failureMsg, isError) {
  if (euromCommandTimer) clearInterval(euromCommandTimer);
  euromCommandTimer = null;
  euromCommandStartedAt = 0;
  euromSetControlsDisabled(false);
  euromSetStatus("eurom_manage_message", isError ? failureMsg : successMsg, isError);
  euromLastCommandPayload = null;
  euromRefreshLive();
}

function euromPollCommandStatus(successMsg, failurePrefix) {
  if (euromCommandStartedAt && (Date.now() - euromCommandStartedAt) > EUROM_CMD_TIMEOUT_MS) {
    euromFinishCommand(successMsg, t("eurom-cmd-timeout") || (failurePrefix + " (timeout)"), true);
    return;
  }

  euromApi("/api/v2/eurom/command")
    .then(json => {
      if (json.phase === EUROM_CMD_RUNNING) {
        euromSetControlsDisabled(true);
        euromSetStatus("eurom_manage_message", t("eurom-cmd-sending"), false);
      } else if (json.phase === EUROM_CMD_DONE && json.ok) {
        euromFinishCommand(successMsg, json.error || failurePrefix, false);
      } else if (json.phase === EUROM_CMD_ERROR || (json.phase === EUROM_CMD_DONE && !json.ok)) {
        euromFinishCommand(successMsg, json.error || failurePrefix, true);
      }
    })
    .catch(err => {
      euromFinishCommand(successMsg, failurePrefix + ": " + err, true);
    });
}

function euromStartCommand(payload, successMsg, failurePrefix) {
  euromLastCommandPayload = payload;
  euromApi("/api/v2/eurom/command", "POST", payload)
    .then(() => {
      if (euromCommandTimer) clearInterval(euromCommandTimer);
      euromCommandStartedAt = Date.now();
      euromSetControlsDisabled(true);
      euromCommandTimer = setInterval(() => euromPollCommandStatus(successMsg, failurePrefix), EUROM_CMD_POLL_MS);
      euromPollCommandStatus(successMsg, failurePrefix);
    })
    .catch(err => {
      euromSetControlsDisabled(false);
      euromSetStatus("eurom_manage_message", failurePrefix + ": " + err, true);
      euromLastCommandPayload = null;
    });
}

function euromSendPower(on) {
  if (euromCommandTimer) return;
  euromUiState.on = !!on;
  euromRenderControls();
  euromStartCommand({ on: !!on }, t("eurom-cmd-ok"), t("eurom-cmd-fail"));
}

function euromSendSetpoint(next) {
  if (euromCommandTimer) return;
  const value = Math.max(EUROM_SETPOINT_MIN, Math.min(EUROM_SETPOINT_MAX, next | 0));
  euromUiState.setpoint_c = value;
  euromRenderControls();
  euromStartCommand({ setpoint_c: value }, t("eurom-cmd-ok"), t("eurom-cmd-fail"));
}

function initEuromControlGrid() {
  const grid = document.getElementById("eurom_ctrl_grid");
  if (grid && !grid.dataset.bound) {
    grid.dataset.bound = "1";
    grid.addEventListener("click", event => {
      const btn = event.target.closest(".helty-ctrl-btn");
      if (!btn || btn.disabled) return;
      if (btn.dataset.action === "on") euromSendPower(true);
      else if (btn.dataset.action === "off") euromSendPower(false);
    });
  }
  document.querySelectorAll(".eurom-setpoint-btn").forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const current = Number.isFinite(euromUiState.setpoint_c) ? euromUiState.setpoint_c : 18;
      if (btn.dataset.action === "setpoint-down") euromSendSetpoint(current - 1);
      else if (btn.dataset.action === "setpoint-up") euromSendSetpoint(current + 1);
    });
  });
}

function euromStartManagement() {
  initEuromControlGrid();
  euromRefreshLive();
  if (euromManagementTimer) clearInterval(euromManagementTimer);
  euromManagementTimer = setInterval(euromRefreshLive, EUROM_MANAGEMENT_POLL_MS);
}

function euromStopManagementPolling() {
  if (euromManagementTimer) {
    clearInterval(euromManagementTimer);
    euromManagementTimer = null;
  }
}

function euromStartDiscover() {
  fetchEuromConfig();
  euromStopDiscoverPolling();
}

let wizScanTimer = null;
let wizPageTimer = null;
let wizConfiguredLights = [];
let wizConfiguredRooms = [];
let wizPollSec = 30;
let wizRgbDebounce = {};
let wizCctDebounce = {};
let wizScanSelectedMacs = new Set();

const WIZ_SCAN_POLL_MS = 1000;
const WIZ_PAGE_POLL_MS = 5000;
const WIZ_CMD_REFRESH_MS = 400;
const WIZ_RGB_DEBOUNCE_MS = 180;
const WIZ_CCT_DEBOUNCE_MS = 350;
const WIZ_CCT_MIN = 2700;
const WIZ_CCT_MAX = 6500;
const WIZ_SCAN_TIMEOUT_MS = 120000;
const WIZ_DISCOVER_SCANNING = 1;
const WIZ_DISCOVER_DONE = 2;
const WIZ_DISCOVER_ERROR = 3;
const WIZ_MOCK_MAC = "aabbccddeeff";

