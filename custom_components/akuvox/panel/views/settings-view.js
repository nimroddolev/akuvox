/**
 * Settings view: Integration configuration, polling timers, secret tokens, and panel options.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260821-import-export-data";
import { callWsWithBlocker, confirmModal, showNotice } from "../components/dialogs.js";
import { CAMERA_ORIENTATION_OPTIONS } from "../utils/orientation.js?v=20260820-camera-orientation";

const cameraOrientationControls = (host, enabledKey, valuesKey, dataKey) => {
  const enabled = Boolean(host._settings?.[enabledKey]);
  const cameras = [...new Set((host._account()?.cameras || []).map((camera) => camera.name).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const values = host._settings?.[valuesKey] || {};
  return `
    <label class="check">
      <input name="${enabledKey}" type="checkbox" data-orientation-toggle="${dataKey}" ${enabled ? "checked" : ""}>
      ${dataKey === "stream" ? "Custom camera stream orientations" : "Custom activity image orientations"}
    </label>
    <div class="camera-orientations" data-orientation-controls="${dataKey}" ${enabled ? "" : "hidden"}>
      ${cameras.map((camera) => `<label>${escapeHtml(camera)}
        <select data-${dataKey}-orientation="${escapeHtml(camera)}">
          ${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${values[camera] === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></label>`).join("") || '<p class="muted">No cameras are currently available for this account.</p>'}
    </div>`;
};

const formatStorageAmount = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number(bytes) || 0);
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const activityStorageProgress = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  if (limitMb <= 0) return "";
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  const percentage = (usedBytes / (limitMb * 1_000_000)) * 100;
  const percentageLabel = `${percentage.toFixed(percentage >= 10 ? 0 : 1)}%`;
  return `<div class="activity-storage-progress" role="progressbar" aria-label="Local activity storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(percentage.toFixed(1))}">
    <span class="activity-storage-progress-fill" style="width:${Math.min(100, percentage)}%"></span>
    <span class="activity-storage-progress-label">${escapeHtml(formatStorageAmount(usedBytes))} Used (${escapeHtml(percentageLabel)})</span>
  </div>`;
};

const sipAccountsSection = (sipAccounts = {}) => {
  const main = sipAccounts.main || {};
  const devices = Array.isArray(sipAccounts.devices) ? sipAccounts.devices : [];
  if (!main.account) {
    return `<fieldset><legend>SIP Accounts</legend><p class="muted">SIP account details are not available yet. Refresh the SmartPlus account and try again.</p></fieldset>`;
  }
  return `<fieldset>
    <legend>SIP Accounts</legend>
    <p class="sip-warning">These credentials are sensitive. Do not share them with anyone else.</p>
    <div class="sip-account-grid">
      <span>SIP server</span><code>${escapeHtml(sipAccounts.server)}</code>
      <span>Transport</span><code>${escapeHtml(sipAccounts.transport)}</code>
      <span>Main account</span><code>${escapeHtml(main.account)}</code>
      <span>Main password</span><code>${escapeHtml(main.password)}</code>
      ${devices.map((device) => `<span>${escapeHtml(device.name || device.mac || "Device")} (${escapeHtml(device.mac)})</span><code>${escapeHtml(device.account)} / ${escapeHtml(device.password)}</code>`).join("")}
    </div>
    <button class="action" type="button" data-export-sip-accounts>Export SIP accounts PDF</button>
  </fieldset>`;
};

const requestSipPdfPassword = (host) => new Promise((resolve) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.innerHTML = `<h2>Protect SIP accounts PDF</h2>
    <p class="sip-warning">This PDF contains passwords. Do not share this information with anyone else.</p>
    <form method="dialog" data-sip-pdf-form>
      <label>Password<input required minlength="8" type="password" autocomplete="new-password" data-sip-pdf-password></label>
      <label>Confirm password<input required minlength="8" type="password" autocomplete="new-password" data-sip-pdf-confirm></label>
      <p class="form-error" data-sip-pdf-error hidden></p>
      <div class="modal-actions"><button class="modal-cancel" value="cancel">Cancel</button><button class="modal-action" value="export">Export PDF</button></div>
    </form>`;
  const form = dialog.querySelector("[data-sip-pdf-form]");
  form.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "export") return;
    const password = form.querySelector("[data-sip-pdf-password]").value;
    const confirmation = form.querySelector("[data-sip-pdf-confirm]").value;
    if (password.length < 8) {
      event.preventDefault();
      const error = form.querySelector("[data-sip-pdf-error]");
      error.textContent = "Use a password containing at least 8 characters.";
      error.hidden = false;
    } else if (password !== confirmation) {
      event.preventDefault();
      const error = form.querySelector("[data-sip-pdf-error]");
      error.textContent = "Passwords must match.";
      error.hidden = false;
    }
  });
  dialog.addEventListener("close", () => {
    const password = dialog.returnValue === "export"
      ? form.querySelector("[data-sip-pdf-password]").value : "";
    const confirmation = dialog.returnValue === "export"
      ? form.querySelector("[data-sip-pdf-confirm]").value : "";
    dialog.remove();
    resolve(password ? { password, confirmation } : null);
  }, { once: true });
  host.shadowRoot.append(dialog);
  dialog.showModal();
  form.querySelector("[data-sip-pdf-password]").focus();
});

/** Update the usage indicator without replacing any unsaved form values. */
export const updateActivityStorageProgress = (host, usageBytes) => {
  if (!host._settings) return;
  host._settings.activity_history_storage_bytes = Math.max(0, Number(usageBytes) || 0);
  const input = host.shadowRoot.querySelector('[name="activity_history_max_storage_mb"]');
  const progress = host.shadowRoot.querySelector("[data-activity-storage-progress]");
  if (!input || !progress) return;
  progress.innerHTML = activityStorageProgress({
    ...host._settings,
    activity_history_max_storage_mb: input.value,
  });
};

/**
 * Render HTML content for the Settings tab.
 * @param {HTMLElement} host
 * @returns {string}
 */
export const renderSettingsView = (host) => {
  if (!host._settings) {
    return `
      <div class="card">
        <h2>Integration settings</h2>
        <p class="muted">Loading settings…</p>
      </div>
    `;
  }

  const settings = host._settings;
  const countries = host._countryOptions
    .map(
      (country) => `
      <option value="${escapeHtml(country.code)}" ${country.code === settings.country_code ? "selected" : ""}>
        ${escapeHtml(country.label)}
      </option>
    `
    )
    .join("");

  const subdomains = host._subdomainOptions
    .map(
      (subdomain) => `
      <button type="button" role="option" data-subdomain-value="${escapeHtml(subdomain)}">
        ${escapeHtml(subdomain)}
      </button>
    `
    )
    .join("");

  const authTokenType = host._revealedSecrets.has("auth_token") ? "text" : "password";
  const sessionTokenType = host._revealedSecrets.has("token") ? "text" : "password";
  const authToggleLabel = host._revealedSecrets.has("auth_token")
    ? "Hide authentication token"
    : "Show authentication token";
  const sessionToggleLabel = host._revealedSecrets.has("token")
    ? "Hide session token"
    : "Show session token";

  const tokenUpdate = settings.token_update || {};
  const tokenUpdatedAt = tokenUpdate.timestamp ? new Date(tokenUpdate.timestamp) : null;
  const tokenUpdateStatus =
    tokenUpdatedAt && !Number.isNaN(tokenUpdatedAt.valueOf())
      ? `<p class="muted">Tokens were last ${tokenUpdate.type === "refreshed" ? "refreshed" : "modified"} on <time datetime="${escapeHtml(tokenUpdate.timestamp)}">${escapeHtml(tokenUpdatedAt.toLocaleString())}</time>.</p>`
      : "";

  return `
    <div class="card">
      <h2>Integration settings</h2>
      <p class="muted">Changes are saved securely and reload the Akuvox account automatically.</p>
      <form data-settings-form>
        <div class="grid">
          <label>
            Phone country
            <select name="country_code">${countries}</select>
          </label>
          <label>
            Regional API subdomain
            <span class="combobox">
              <input required data-subdomain-input name="subdomain" autocomplete="off" value="${escapeHtml(settings.subdomain)}">
              <button type="button" class="combobox-toggle" aria-label="Show regional API subdomains" aria-haspopup="listbox" data-subdomain-toggle>
                ${icons.chevronDown}
              </button>
              <span class="combobox-menu" role="listbox" data-subdomain-menu hidden>
                ${subdomains}
              </span>
            </span>
          </label>
          <label>
            Event screenshot delivery
            <select name="event_screenshot_options">
              <option value="asap" ${settings.event_screenshot_options === "asap" ? "selected" : ""}>As soon as available</option>
              <option value="wait" ${settings.event_screenshot_options === "wait" ? "selected" : ""}>Wait for screenshot URLs</option>
            </select>
          </label>
          <label>
            Polling interval (seconds)
            <input required name="door_log_poll_interval" type="number" min="30" max="3600" value="${escapeHtml(settings.door_log_poll_interval)}">
          </label>
          <label>
            Maximum retry backoff (seconds)
            <input required name="door_log_max_backoff" type="number" min="60" max="3600" value="${escapeHtml(settings.door_log_max_backoff)}">
          </label>
        </div>

        <fieldset>
          <legend>Camera Options</legend>
          ${cameraOrientationControls(host, "custom_camera_stream_orientations", "camera_stream_orientations", "stream")}
          ${cameraOrientationControls(host, "custom_activity_image_orientations", "activity_image_orientations", "activity")}
        </fieldset>

        <fieldset>
          <legend>Panel Options</legend>
          <label class="check">
            <input name="store_activity_history" type="checkbox" ${settings.store_activity_history ? "checked" : ""}>
            Store activity history and preview images locally
          </label>
          <div data-activity-storage-limit-controls ${settings.store_activity_history ? "" : "hidden"}>
            <label class="activity-storage-limit-row">
              <span class="activity-storage-limit">
                <input name="activity_history_max_storage_mb" type="number" min="0" value="${escapeHtml(settings.activity_history_max_storage_mb || 0)}" aria-label="Local activity storage limit in MB">
                <span class="activity-storage-limit-description" data-activity-storage-limit-description ${Number(settings.activity_history_max_storage_mb) > 0 ? "hidden" : ""}>Local activity storage limit in MB (0 = unlimited)</span>
                <span data-activity-storage-progress>${activityStorageProgress(settings)}</span>
                <button class="activity-storage-action activity-storage-clear" type="button" data-clear-activity-storage>${icons.trash}<span>Clear Data</span></button>
                <span class="activity-storage-transfer-actions">
                  <button class="activity-storage-action activity-storage-download" type="button" data-export-activity-storage>${icons.download}<span>Export Data</span></button>
                  <button class="activity-storage-action activity-storage-import" type="button" data-import-activity-storage>${icons.upload}<span>Import Data</span></button>
                </span>
                <input data-import-activity-file type="file" accept=".zip,application/zip" hidden>
              </span>
            </label>
          </div>
          <label class="check">
            <input name="panel_enabled" type="checkbox" ${settings.panel_enabled ? "checked" : ""}> Show the SmartPlus panel in the sidebar
          </label>
          <label class="check">
            <input name="panel_admin_only" type="checkbox" ${settings.panel_admin_only ? "checked" : ""}> Restrict panel access to administrators
          </label>
          <label class="check">
            <input name="mirror_activity_images" type="checkbox" ${settings.mirror_activity_images ? "checked" : ""}> Mirror activity images
          </label>
          <label class="check">
            <input name="debug_logging" type="checkbox" ${settings.debug_logging ? "checked" : ""}> Enable debug logging
          </label>
        </fieldset>

        <fieldset>
          <legend>SmartPlus credentials</legend>
          <p class="muted">These private values are shown only to Home Assistant administrators and are never saved in config-entry data.</p>
          <label>
            Authentication token
            <span class="secret-input">
              <input required autocomplete="off" name="auth_token" type="${authTokenType}" value="${escapeHtml(settings.auth_token)}">
              <button type="button" class="secret-toggle" data-toggle-secret="auth_token" aria-label="${authToggleLabel}">
                ${host._revealedSecrets.has("auth_token") ? icons.eyeOff : icons.eye}
              </button>
            </span>
          </label>
          <label>
            Session token
            <span class="secret-input">
              <input required autocomplete="off" name="token" type="${sessionTokenType}" value="${escapeHtml(settings.token)}">
              <button type="button" class="secret-toggle" data-toggle-secret="token" aria-label="${sessionToggleLabel}">
                ${host._revealedSecrets.has("token") ? icons.eyeOff : icons.eye}
              </button>
            </span>
          </label>
          ${tokenUpdateStatus}
        </fieldset>

        <button class="action" type="submit">Save settings</button>
      </form>
    </div>
  `;
};

/**
 * Handle form submission and persist updated integration settings.
 * @param {HTMLElement} host
 * @param {SubmitEvent} event
 */
export const handleSaveSettings = async (host, event) => {
  event.preventDefault();
  if (host._settingsSaving) return;

  const form = new FormData(event.target);
  const polling = Number(form.get("door_log_poll_interval"));
  const backoff = Number(form.get("door_log_max_backoff"));
  const subdomain = String(form.get("subdomain")).trim();

  if (backoff < polling) {
    showNotice(
      host,
      "Maximum backoff must not be shorter than the polling interval.",
      "Check settings"
    );
    return;
  }

  host._settingsSaving = true;
  try {
    const saved = {
      country_code: String(form.get("country_code")),
      subdomain,
      event_screenshot_options: String(form.get("event_screenshot_options")),
      door_log_poll_interval: polling,
      door_log_max_backoff: backoff,
      panel_enabled: form.get("panel_enabled") === "on",
      panel_admin_only: form.get("panel_admin_only") === "on",
      mirror_activity_images: form.get("mirror_activity_images") === "on",
      store_activity_history: form.get("store_activity_history") === "on",
      activity_history_max_storage_mb: Number(form.get("activity_history_max_storage_mb")),
      custom_camera_stream_orientations: form.get("custom_camera_stream_orientations") === "on",
      camera_stream_orientations: Object.fromEntries(
        [...event.target.querySelectorAll("[data-stream-orientation]")].map((select) => [select.dataset.streamOrientation, select.value])
      ),
      custom_activity_image_orientations: form.get("custom_activity_image_orientations") === "on",
      activity_image_orientations: Object.fromEntries(
        [...event.target.querySelectorAll("[data-activity-orientation]")].map((select) => [select.dataset.activityOrientation, select.value])
      ),
      debug_logging: form.get("debug_logging") === "on",
      auth_token: String(form.get("auth_token")).trim(),
      token: String(form.get("token")).trim(),
    };

    const result = await host._hass.callWS({
      type: "akuvox/panel_save_settings",
      entry_id: host._activeAccount,
      ...saved,
    });

    host._settings = {
      ...host._settings,
      ...saved,
      token_update: result.token_update || host._settings?.token_update,
    };
    host._settingsDirty = false;
    await host._load();
    showNotice(host, "SmartPlus settings saved. The account is reloading.");
  } catch (_) {
    showNotice(
      host,
      "The SmartPlus settings could not be saved. Check that both tokens are present and the values are valid.",
      "Could not save settings"
    );
  } finally {
    host._settingsSaving = false;
  }
};

/**
 * Attach event listeners for the Settings tab.
 * @param {HTMLElement} host
 */
export const bindSettingsEvents = (host) => {
  const settingsForm = host.shadowRoot.querySelector("[data-settings-form]");
  if (!settingsForm) return;

  settingsForm.addEventListener("submit", (event) => handleSaveSettings(host, event));
  settingsForm.addEventListener("input", () => {
    host._settingsDirty = true;
  });
  settingsForm.addEventListener("change", () => {
    host._settingsDirty = true;
  });

  const storageLimitInput = settingsForm.querySelector(
    '[name="activity_history_max_storage_mb"]'
  );
  const storageProgress = settingsForm.querySelector(
    "[data-activity-storage-progress]"
  );
  const storageLimitDescription = settingsForm.querySelector(
    "[data-activity-storage-limit-description]"
  );
  const updateStorageProgress = () => {
    if (!storageLimitInput || !storageProgress) return;
    storageProgress.innerHTML = activityStorageProgress({
      ...host._settings,
      activity_history_max_storage_mb: storageLimitInput.value,
    });
    if (storageLimitDescription) {
      storageLimitDescription.hidden = Number(storageLimitInput.value) > 0;
    }
  };
  storageLimitInput?.addEventListener("input", updateStorageProgress);
  storageLimitInput?.addEventListener("change", updateStorageProgress);

  const storageHistoryToggle = settingsForm.querySelector(
    '[name="store_activity_history"]'
  );
  const storageLimitControls = settingsForm.querySelector(
    "[data-activity-storage-limit-controls]"
  );
  storageHistoryToggle?.addEventListener("change", () => {
    if (storageLimitControls) storageLimitControls.hidden = !storageHistoryToggle.checked;
  });

  settingsForm.querySelector("[data-export-sip-accounts]")?.addEventListener("click", async () => {
    const credentials = await requestSipPdfPassword(host);
    if (!credentials) return;
    try {
      const pdf = await callWsWithBlocker(host, {
        type: "akuvox/panel_export_sip_accounts_pdf",
        entry_id: host._activeAccount,
        password: credentials.password,
        password_confirmation: credentials.confirmation,
      });
      const binary = window.atob(pdf.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = host.shadowRoot.ownerDocument.createElement("a");
      link.href = url;
      link.download = pdf.filename || "akuvox_sip_accounts.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showNotice(host, error?.message || "Could not export SIP account details.", "Export failed");
    }
  });

  settingsForm.querySelector("[data-clear-activity-storage]")?.addEventListener("click", async () => {
    const confirmed = await confirmModal(
      host,
      "This permanently deletes all locally stored activity records and preview images for this account.",
      "Clear local activity data?",
      "Clear Data"
    );
    if (!confirmed) return;
    try {
      await callWsWithBlocker(host, {
        type: "akuvox/panel_clear_activity_storage",
        entry_id: host._activeAccount,
      });
      host._activityImages?.clear();
      host._activityImageFailures?.clear();
      await host._load();
      showNotice(host, "All locally stored activity data was cleared.", "Activity data cleared");
    } catch (error) {
      showNotice(host, error?.message || "Could not clear locally stored activity data.", "Clear failed");
    }
  });

  settingsForm.querySelector("[data-download-activity-storage]")?.addEventListener("click", async () => {
    try {
      const archive = await callWsWithBlocker(host, {
        type: "akuvox/panel_export_activity_storage",
        entry_id: host._activeAccount,
      });
      const binary = window.atob(archive.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const link = host.shadowRoot.ownerDocument.createElement("a");
      link.href = url;
      link.download = archive.filename || "akuvox_activity.zip";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showNotice(host, error?.message || "Could not export locally stored data.", "Export failed");
    }
  });

  const importInput = settingsForm.querySelector("[data-import-activity-file]");
  settingsForm.querySelector("[data-import-activity-storage]")?.addEventListener("click", () => {
    importInput?.click();
  });
  importInput?.addEventListener("change", async () => {
    const [file] = importInput.files || [];
    if (!file) return;
    const confirmed = await confirmModal(
      host,
      "Import activity and call history from this archive? Imported records are merged with existing local data.",
      "Import local data?",
      "Import Data"
    );
    if (!confirmed) {
      importInput.value = "";
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const result = await callWsWithBlocker(host, {
        type: "akuvox/panel_import_activity_storage",
        entry_id: host._activeAccount,
        archive: window.btoa(binary),
      });
      await host._load();
      showNotice(
        host,
        `Imported ${result.activity_imported || 0} activity record(s) and ${result.call_history_imported || 0} call-history record(s).`,
        "Data imported"
      );
    } catch (error) {
      showNotice(host, error?.message || "Could not import the selected data archive.", "Import failed");
    } finally {
      importInput.value = "";
    }
  });

  settingsForm.querySelectorAll("[data-orientation-toggle]").forEach((toggle) =>
    toggle.addEventListener("change", () => {
      const controls = settingsForm.querySelector(`[data-orientation-controls="${toggle.dataset.orientationToggle}"]`);
      if (controls) controls.hidden = !toggle.checked;
    })
  );

  // Secret input toggles (show/hide password)
  host.shadowRoot.querySelectorAll("[data-toggle-secret]").forEach((button) =>
    button.addEventListener("click", () => {
      const secretKey = button.dataset.toggleSecret;
      const input = host.shadowRoot.querySelector(`[name="${secretKey}"]`);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";

      if (visible) host._revealedSecrets.delete(secretKey);
      else host._revealedSecrets.add(secretKey);

      button.setAttribute(
        "aria-label",
        visible
          ? `Show ${secretKey.replace("_", " ")}`
          : `Hide ${secretKey.replace("_", " ")}`
      );
      button.innerHTML = visible ? icons.eye : icons.eyeOff;
    })
  );

  // Subdomain combobox dropdown
  const subdomainInput = host.shadowRoot.querySelector("[data-subdomain-input]");
  const subdomainMenu = host.shadowRoot.querySelector("[data-subdomain-menu]");

  host.shadowRoot
    .querySelector("[data-subdomain-toggle]")
    ?.addEventListener("click", () => {
      if (!subdomainMenu) return;
      subdomainMenu.hidden = !subdomainMenu.hidden;
      if (!subdomainMenu.hidden && subdomainInput) subdomainInput.focus();
    });

  host.shadowRoot.querySelectorAll("[data-subdomain-value]").forEach((option) =>
    option.addEventListener("click", () => {
      if (!subdomainInput) return;
      subdomainInput.value = option.dataset.subdomainValue;
      host._settingsDirty = true;
      subdomainInput.dispatchEvent(new Event("change", { bubbles: true }));
      if (subdomainMenu) subdomainMenu.hidden = true;
      subdomainInput.focus();
    })
  );

  if (subdomainMenu) {
    host._subdomainOutsideAbort = new AbortController();
    host.shadowRoot.ownerDocument.addEventListener(
      "click",
      (event) => {
        if (!event.composedPath().includes(subdomainMenu.parentElement)) {
          subdomainMenu.hidden = true;
        }
      },
      { capture: true, signal: host._subdomainOutsideAbort.signal }
    );
  }
};
