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

function fetchHeltyConfig() {
  return heltyApi("/api/v2/helty/config").then(json => {
    document.getElementById("helty_host").value = json.host || "";
    document.getElementById("helty_port").value = json.port || 5001;
    document.getElementById("helty_poll").value = json.poll_interval_sec || 30;
    document.getElementById("helty_enabled").checked = !!json.enabled;
    return json;
  }).catch(err => {
    console.error("Helty config load failed", err);
  });
}

function heltySave() {
  const payload = {
    enabled: document.getElementById("helty_enabled").checked,
    host: document.getElementById("helty_host").value.trim(),
    port: parseInt(document.getElementById("helty_port").value, 10) || 5001,
    poll_interval_sec: parseInt(document.getElementById("helty_poll").value, 10) || 30
  };
  heltyApi("/api/v2/helty/config", "POST", payload)
    .then(() => {
      heltySetStatus("helty_discover_status", "Configuration saved.", false);
      if (payload.host) heltyTest();
    })
    .catch(err => heltySetStatus("helty_discover_status", "Save failed: " + err, true));
}

function heltyTest() {
  const host = document.getElementById("helty_host").value.trim();
  const port = parseInt(document.getElementById("helty_port").value, 10) || 5001;
  if (!host) {
    heltySetStatus("helty_discover_status", "Enter a host or IP address.", true);
    return;
  }
  heltySetStatus("helty_discover_status", "Testing connection...", false);
  heltyApi("/api/v2/helty/discover", "POST", { mode: "test", host, port })
    .then(() => {
      if (heltyTestTimer) clearInterval(heltyTestTimer);
      heltyTestTimer = setInterval(heltyPollTestStatus, 2000);
      heltyPollTestStatus();
    })
    .catch(err => heltySetStatus("helty_discover_status", "Test failed: " + err, true));
}

function heltyPollTestStatus() {
  heltyApi("/api/v2/helty/discover")
    .then(json => {
      if (json.phase === 1) {
        heltySetStatus("helty_discover_status", "Testing connection...", false);
      } else if (json.phase === 3 && json.test_host) {
        clearInterval(heltyTestTimer);
        heltyTestTimer = null;
        const msg = "Connected: " + (json.test_name || json.test_host);
        heltySetStatus("helty_discover_status", msg + (document.getElementById("helty_enabled").checked ? "" : " â€” enable Air Guard hub to poll"), false);
        if (json.test_name) {
          const hostEl = document.getElementById("helty_host");
          if (hostEl && !hostEl.value.trim()) hostEl.value = json.test_host;
        }
      } else if (json.phase === 4 && json.test_host) {
        clearInterval(heltyTestTimer);
        heltyTestTimer = null;
        heltySetStatus("helty_discover_status", json.error || "Connection failed", true);
      }
    })
    .catch(err => {
      clearInterval(heltyTestTimer);
      heltyTestTimer = null;
      heltySetStatus("helty_discover_status", "Test failed: " + err, true);
    });
}

function heltySetDiscoverButtonsDisabled(disabled) {
  document.querySelectorAll("#HeltyDiscover button").forEach(btn => {
    btn.disabled = !!disabled;
  });
}

function heltyStopDiscoverPolling() {
  if (heltyScanTimer) {
    clearInterval(heltyScanTimer);
    heltyScanTimer = null;
  }
  if (heltyScanTimeoutTimer) {
    clearTimeout(heltyScanTimeoutTimer);
    heltyScanTimeoutTimer = null;
  }
  if (heltyTestTimer) {
    clearInterval(heltyTestTimer);
    heltyTestTimer = null;
  }
  heltySetDiscoverButtonsDisabled(false);
}

function heltyFinishScan(message, isError) {
  heltyStopDiscoverPolling();
  heltySetStatus("helty_scan_progress", message, isError);
}

function heltyRenderScanResults(results) {
  const table = document.getElementById("helty_scan_results");
  const body = document.getElementById("helty_scan_results_body");
  if (!table || !body) return;
  body.innerHTML = "";
  if (!results || !results.length) {
    table.style.display = "none";
    return;
  }
  results.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${item.name || "-"}</td><td>${item.host}</td><td><button type="button">Select</button></td>`;
    row.querySelector("button").onclick = () => {
      document.getElementById("helty_host").value = item.host;
      heltySetStatus("helty_discover_status", "Selected " + (item.name || item.host), false);
    };
    body.appendChild(row);
  });
  table.style.display = "";
}

function heltyPollScanStatus() {
  heltyApi("/api/v2/helty/discover")
    .then(json => {
      if (json.phase === 0) {
        heltySetStatus("helty_scan_progress", "Scan queued...", false);
      } else if (json.phase === 1) {
        heltyFinishScan("Helty client busy (test or poll in progress)", true);
      } else if (json.phase === 2) {
        const partial = json.results || [];
        if (partial.length) heltyRenderScanResults(partial);
        const foundNote = partial.length
          ? " â€” found " + partial.length + " device" + (partial.length === 1 ? "" : "s")
          : "";
        heltySetStatus("helty_scan_progress", "Scanning... " + (json.progress || 0) + "%" + foundNote, false);
      } else if (json.phase === 3) {
        const results = json.results || [];
        heltyFinishScan(
          results.length
            ? "Scan complete."
            : "Scan complete â€” no Air Guard devices found on this subnet.",
          false
        );
        heltyRenderScanResults(results);
      } else if (json.phase === 4) {
        heltyFinishScan(json.error || "Scan failed", true);
      }
    })
    .catch(err => {
      heltyFinishScan("Scan status failed: " + err, true);
    });
}

function heltyScan() {
  if (heltyScanTimer) return;
  const host = document.getElementById("helty_host").value.trim();
  if (host) {
    heltySetStatus("helty_scan_progress", "Known IP configured â€” testing " + host + " instead of scanning subnet.", false);
    heltyTest();
    return;
  }
  heltySetStatus("helty_scan_progress", "Starting network scan...", false);
  document.getElementById("helty_scan_results").style.display = "none";
  heltySetDiscoverButtonsDisabled(true);
  const port = parseInt(document.getElementById("helty_port").value, 10) || 5001;
  heltyApi("/api/v2/helty/discover", "POST", { mode: "scan", port })
    .then(() => {
      heltyStopDiscoverPolling();
      heltySetDiscoverButtonsDisabled(true);
      heltyScanTimer = setInterval(heltyPollScanStatus, HELTY_SCAN_POLL_MS);
      heltyPollScanStatus();
      heltyScanTimeoutTimer = setTimeout(() => {
        if (heltyScanTimer) heltyFinishScan("Scan timed out", true);
      }, HELTY_SCAN_TIMEOUT_MS);
    })
    .catch(err => {
      heltyFinishScan("Scan start failed: " + err, true);
    });
}

function heltyFormatValue(label, value, unit) {
  if (value === undefined || value === null || value === "") return "";
  return `<div class="card"><h1>${label}</h1><h2>${value}${unit ? " " + unit : ""}</h2></div>`;
}

function heltyEscapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  if (displayName && host) return heltyEscapeHtml(displayName) + " Â· " + heltyEscapeHtml(host);
  return heltyEscapeHtml(displayName || host);
}

function heltyUpdateStatusBadge(json) {
  const statusEl = document.getElementById("helty_status_badge");
  if (!statusEl) return;

  let stateClass;
  let icon;
  let label;
  let deviceLine = "";

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
    if (json.last_poll_age_sec !== undefined) label += " (" + json.last_poll_age_sec + "s)";
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
}

function heltyUpdateTelemetryGrid(json) {
  const grid = document.getElementById("helty_telemetry");
  if (!grid) return;
  let html = "";
  html += heltyFormatValue(t("helty-tx-fan-mode"), json.fan_mode);
  html += heltyFormatValue(t("helty-tx-indoor-temp"), json.indoor_temperature, "Â°C");
  html += heltyFormatValue(t("helty-tx-outdoor-temp"), json.outdoor_temperature, "Â°C");
  html += heltyFormatValue(t("helty-tx-humidity"), json.indoor_humidity, "%");
  if (json.co2 > 0) html += heltyFormatValue(t("helty-tx-co2"), json.co2, "ppm");
  if (json.voc > 0) html += heltyFormatValue(t("helty-tx-voc"), json.voc, "ppb");
  if (json.filter_hours) html += heltyFormatValue(t("helty-tx-filter-hours"), json.filter_hours);
  if (json.last_poll_age_sec !== undefined) html += heltyFormatValue(t("helty-tx-last-update"), json.last_poll_age_sec, "s ago");
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

function heltySetControlGridDisabled(disabled) {
  document.querySelectorAll("#helty_ctrl_grid .helty-ctrl-btn").forEach(btn => {
    btn.disabled = !!disabled;
  });
}

function heltyRefreshManagement() {
  const refreshBtn = document.getElementById("helty_refresh_btn");
  if (refreshBtn) refreshBtn.disabled = true;
  return heltyApi("/api/v2/helty/live").then(json => {
    heltyUpdateStatusBadge(json);
    heltyUpdateTelemetryGrid(json);
    return json;
  }).catch(err => {
    heltySetStatus("helty_manage_message", "Refresh failed: " + err, true);
  }).finally(() => {
    if (refreshBtn) refreshBtn.disabled = false;
  });
}

function heltySendFanMode(mode) {
  if (!mode || heltyCommandTimer) return;
  heltyUiState.fan_mode = mode;
  heltyRenderControlGrid();
  const payload = { fan_mode: mode };
  heltyLastCommandPayload = payload;
  heltyStartCommand(payload, "Command applied.", "Command failed");
}

function heltySendLed() {
  if (heltyCommandTimer) return;
  heltyUiState.led = !heltyUiState.led;
  heltyRenderControlGrid();
  const payload = { led: heltyUiState.led };
  heltyLastCommandPayload = payload;
  heltyStartCommand(payload, "Command applied.", "Command failed");
}

function heltySendResetFilter() {
  if (heltyCommandTimer) return;
  if (!window.confirm(t("helty-reset-filter-confirm") || "Reset filter counter on the unit?")) return;
  heltyLastCommandPayload = { reset_filter: true };
  heltyStartCommand({ reset_filter: true }, "Filter counter reset.", "Reset failed");
}

function heltyFinishCommand(successMsg, failureMsg, isError) {
  if (heltyCommandTimer) clearInterval(heltyCommandTimer);
  heltyCommandTimer = null;
  heltyCommandStartedAt = 0;
  heltySetControlGridDisabled(false);
  heltySetStatus("helty_manage_message", isError ? failureMsg : successMsg, isError);
  if (!isError && heltyLastCommandPayload) {
    if (heltyLastCommandPayload.fan_mode) heltyUiState.fan_mode = heltyLastCommandPayload.fan_mode;
    if (heltyLastCommandPayload.led !== undefined) heltyUiState.led = heltyLastCommandPayload.led;
    heltyRenderControlGrid();
  }
  heltyLastCommandPayload = null;
}

function heltyPollCommandStatus(successMsg, failurePrefix) {
  if (heltyCommandStartedAt && (Date.now() - heltyCommandStartedAt) > HELTY_CMD_TIMEOUT_MS) {
    heltyFinishCommand(successMsg, failurePrefix + " (timeout)", true);
    return;
  }

  heltyApi("/api/v2/helty/command")
    .then(json => {
      if (json.phase === HELTY_CMD_RUNNING) {
        heltySetControlGridDisabled(true);
        heltySetStatus("helty_manage_message", "Sending command...", false);
      } else if (json.phase === HELTY_CMD_DONE && json.ok) {
        heltyFinishCommand(successMsg, json.error || failurePrefix, false);
      } else if (json.phase === HELTY_CMD_ERROR || (json.phase === HELTY_CMD_DONE && !json.ok)) {
        heltyFinishCommand(successMsg, json.error || failurePrefix, true);
      }
    })
    .catch(err => {
      heltyFinishCommand(successMsg, failurePrefix + ": " + err, true);
    });
}

function heltyStartCommand(payload, successMsg, failurePrefix) {
  heltyApi("/api/v2/helty/command", "POST", payload)
    .then(() => {
      if (heltyCommandTimer) clearInterval(heltyCommandTimer);
      heltyCommandStartedAt = Date.now();
      heltySetControlGridDisabled(true);
      heltyCommandTimer = setInterval(() => heltyPollCommandStatus(successMsg, failurePrefix), HELTY_CMD_POLL_MS);
      heltyPollCommandStatus(successMsg, failurePrefix);
    })
    .catch(err => {
      heltySetControlGridDisabled(false);
      heltySetStatus("helty_manage_message", failurePrefix + ": " + err, true);
      heltyLastCommandPayload = null;
    });
}

function heltyStartManagement() {
  heltyApi("/api/v2/helty/live")
    .then(json => {
      heltySeedUiState(json);
      heltyUpdateStatusBadge(json);
      heltyUpdateTelemetryGrid(json);
    })
    .catch(err => heltySetStatus("helty_manage_message", "Load failed: " + err, true));
  heltyRefreshManagement();
  if (heltyManagementTimer) clearInterval(heltyManagementTimer);
  heltyManagementTimer = setInterval(heltyRefreshManagement, HELTY_MANAGEMENT_POLL_MS);
}

function heltyStopManagementPolling() {
  if (heltyManagementTimer) {
    clearInterval(heltyManagementTimer);
    heltyManagementTimer = null;
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

function heltyStartDiscover() {
  fetchHeltyConfig().then(json => {
    heltyStopDiscoverPolling();
    if (json && json.host) {
      heltySetStatus("helty_discover_status", "Testing configured host " + json.host + "...", false);
      heltyTest();
    }
  });
}

let euromScanTimer = null;
let euromScanTimeoutTimer = null;
let euromTestTimer = null;
let euromManagementTimer = null;
let euromCommandTimer = null;
let euromCommandStartedAt = 0;
let euromLastCommandPayload = null;
let euromUiState = { on: false, setpoint_c: null };
const EUROM_SCAN_TIMEOUT_MS = 5 * 60 * 1000;
const EUROM_SCAN_POLL_MS = 1000;
const EUROM_MANAGEMENT_POLL_MS = 10000;
const EUROM_CMD_IDLE = 0;
const EUROM_CMD_RUNNING = 1;
const EUROM_CMD_DONE = 2;
const EUROM_CMD_ERROR = 3;
const EUROM_CMD_POLL_MS = 1000;
const EUROM_CMD_TIMEOUT_MS = 20000;
const EUROM_SETPOINT_MIN = 0;
const EUROM_SETPOINT_MAX = 37;

