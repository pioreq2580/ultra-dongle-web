let euromTestTimer = null;
let euromManagementTimer = null;
let euromCommandTimer = null;
let euromCommandStartedAt = 0;
let euromLastLiveKey = "";
let euromUiState = { on: false, setpoint_c: null };
const EUROM_LIVE_MS = 1000;
const EUROM_CMD_IDLE = 0;
const EUROM_CMD_RUNNING = 1;
const EUROM_CMD_DONE = 2;
const EUROM_CMD_ERROR = 3;
const EUROM_CMD_POLL_MS = 400;
const EUROM_CMD_TIMEOUT_MS = 20000;
const EUROM_SETPOINT_MIN = 0;
const EUROM_SETPOINT_MAX = 37;

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
      euromTestTimer = setInterval(euromPollTestStatus, 400);
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
        const warn = json.error ? " — " + json.error : "";
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

function euromScan() {
  location.hash = "HubDevices";
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
  html += card(t("eurom-tx-setpoint"), json.setpoint_c, "\u00b0C");
  html += card(t("eurom-tx-temp"), json.temperature_c, "\u00b0C");
  html += card(t("eurom-tx-timer"), json.timer_min, "min");
  if (json.error) html += card(t("eurom-tx-error"), json.error);
  grid.innerHTML = html || `<div class="helty-status">${t("eurom-tx-none")}</div>`;
}

function euromRefreshLive() {
  return euromApi("/api/v2/eurom/live").then(json => {
    euromUpdateStatusBadge(json);
    const key = [json.connected, json.on, json.setpoint_c, json.temperature_c, json.error].join("|");
    if (key !== euromLastLiveKey) {
      euromLastLiveKey = key;
      euromUpdateTelemetryGrid(json);
    }
    if (!euromCommandTimer) euromSeedUiState(json);
    return json;
  }).catch(err => euromSetStatus("eurom_manage_message", "Refresh failed: " + err, true));
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
      ? euromUiState.setpoint_c + " \u00b0C"
      : "\u2014";
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
  euromSetStatus("eurom_manage_message", isError ? failureMsg : "", isError);
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
      if (json.phase === EUROM_CMD_RUNNING) return;
      if (json.phase === EUROM_CMD_DONE && json.ok) {
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
  fetchEuromConfig();
  initEuromControlGrid();
  euromRefreshLive();
  if (euromManagementTimer) clearInterval(euromManagementTimer);
  euromManagementTimer = setInterval(euromRefreshLive, EUROM_LIVE_MS);
}

function euromStopManagementPolling() {
  if (euromManagementTimer) {
    clearInterval(euromManagementTimer);
    euromManagementTimer = null;
  }
  if (euromTestTimer) {
    clearInterval(euromTestTimer);
    euromTestTimer = null;
  }
}

function euromStartDiscover() {
  fetchEuromConfig();
}
