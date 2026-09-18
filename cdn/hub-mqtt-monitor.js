function getMqttMonitorSetting() {
  return objDAL?.dev_settings?.mqtt_monitor;
}

function getMqttMonitorEnabled() {
  const setting = getMqttMonitorSetting();
  if (typeof setting === "boolean") return setting;
  if (setting && typeof setting === "object" && "value" in setting) return !!setting.value;
  return null;
}

function renderMqttMonitorData(json) {
  const body = document.getElementById("mqtt_monitor_body");
  const empty = document.getElementById("mqtt_monitor_empty");
  const wrap = document.getElementById("mqtt_monitor_table_wrap");
  const tbody = document.querySelector("#mqtt_monitor_table tbody");
  if (!body || !empty || !wrap || !tbody) return;

  if (!json?.enabled) {
    body.style.display = "none";
    wrap.style.display = "none";
    empty.style.display = "";
    tbody.innerHTML = "";
    return;
  }

  body.style.display = "";
  tbody.innerHTML = "";

  const rows = Array.isArray(json.data) ? json.data : [];
  if (rows.length === 0) {
    wrap.style.display = "none";
    empty.style.display = "";
    return;
  }

  empty.style.display = "none";
  wrap.style.display = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");
    const rawTime = row.time ?? row.timestamp;
    [
      rawTime ? formatTimestamp(rawTime) : "-",
      row.system ?? "-",
      row.dir ?? "-",
      row.topic ?? "-",
      row.result ?? "-"
    ].forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });
}

function refreshMqttMonitorData() {
  const enabled = getMqttMonitorEnabled();
  if (!enabled) {
    renderMqttMonitorData({ enabled: false, data: [] });
    return;
  }

  fetch("/api/v2/mqtt/monitor")
    .then(response => response.json())
    .then(json => renderMqttMonitorData(json))
    .catch(error => console.error("refreshMqttMonitorData()", error));
}

function refreshMqttMonitorView() {
  const card = document.getElementById("mqtt_monitor_card");
  const toggle = document.getElementById("mqtt_monitor_toggle");
  const mqttEnabled = document.getElementById("setFld_mqtt_enabled");
  const enabled = getMqttMonitorEnabled();
  if (!card || !toggle) return;

  if (enabled === null || (mqttEnabled && !mqttEnabled.checked)) {
    card.style.display = "none";
    return;
  }

  card.style.display = "";
  toggle.checked = enabled;
  renderMqttMonitorData({ enabled, data: [] });
  if (enabled) refreshMqttMonitorData();
}

function initMqttMonitorControls() {
  const toggle = document.getElementById("mqtt_monitor_toggle");
  const refreshBtn = document.getElementById("mqtt_monitor_refresh");
  const clearBtn = document.getElementById("mqtt_monitor_clear");

  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("change", () => {
      sendPostSetting("mqtt_monitor", toggle.checked);
      if (objDAL?.dev_settings) objDAL.dev_settings.mqtt_monitor = toggle.checked;
      refreshMqttMonitorView();
    });
  }

  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = "1";
    refreshBtn.addEventListener("click", event => {
      event.preventDefault();
      refreshMqttMonitorData();
    });
  }

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = "1";
    clearBtn.addEventListener("click", event => {
      event.preventDefault();
      fetch("/api/v2/mqtt/monitor", { method: "POST" })
        .then(() => refreshMqttMonitorData())
        .catch(error => console.error("clear mqtt monitor", error));
    });
  }
}
