/**
 * Settings view: Event, display, and panel options.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260829-camera-copy-visible";
import { callWsWithBlocker, confirmModal, showNotice } from "../components/dialogs.js";
import { CAMERA_ORIENTATION_OPTIONS } from "../utils/orientation.js?v=20260830-combined-directional-labels";

const cameraOptionsTable = (host) => {
  const cameras = [...new Set((host._account()?.cameras || []).map((camera) => camera.name).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const streamOrientations = host._settings?.camera_stream_orientations || {};
  const activityOrientations = host._settings?.activity_image_orientations || {};
  return `
    <div class="table-wrap camera-options-wrap">
      <table class="camera-options-table">
        <thead><tr><th>Camera</th><th>Stream Orientation</th><th>Activity Image Orientation</th><th>RTSP Url</th></tr></thead>
        <tbody>
          ${cameras.map((camera) => `<tr>
            <td title="${escapeHtml(camera)}">${escapeHtml(camera)}</td>
            <td><select name="camera_stream_orientation" data-stream-orientation="${escapeHtml(camera)}" aria-label="${escapeHtml(camera)} stream orientation">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${streamOrientations[camera] === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
            <td><select name="activity_image_orientation" data-activity-orientation="${escapeHtml(camera)}" aria-label="${escapeHtml(camera)} activity image orientation">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${activityOrientations[camera] === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
            <td><button class="action camera-copy-rtsp" type="button" data-stream="${escapeHtml(camera)}" data-mode="copy" aria-label="Copy RTSP link" title="Copy RTSP link">${icons.copy}</button></td>
          </tr>`).join("") || '<tr><td colspan="4" class="muted">No cameras are currently available for this account.</td></tr>'}
        </tbody>
      </table>
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

const formSignature = (form) => JSON.stringify([...new FormData(form).entries()]);

const activityStorageLimitWarning = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  if (limitMb <= 0) return "";
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  return usedBytes > limitMb * 1_000_000
    ? `<p class="activity-storage-limit-warning" role="alert">Increase the storage amount or lose stored activity data and preview images</p>`
    : "";
};

const activityStorageProgress = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  if (limitMb <= 0) {
    return usedBytes > 0
      ? `<span class="activity-storage-used">${escapeHtml(formatStorageAmount(usedBytes))} stored</span>`
      : "";
  }
  const percentage = (usedBytes / (limitMb * 1_000_000)) * 100;
  const percentageLabel = `${percentage.toFixed(percentage >= 10 ? 0 : 1)}%`;
  const exceedsLimit = usedBytes > limitMb * 1_000_000;
  return `<div class="activity-storage-progress${exceedsLimit ? " is-over-limit" : ""}" role="progressbar" aria-label="Local activity storage used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(Math.min(100, percentage).toFixed(1))}">
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
  const warning = host.shadowRoot.querySelector("[data-activity-storage-limit-warning]");
  const progress = host.shadowRoot.querySelector("[data-activity-storage-progress]");
  if (!progress) return;
  const liveLimitInput = host.shadowRoot.querySelector(
    '[name="activity_history_max_storage_mb"]'
  );
  const settings = {
    ...host._settings,
    activity_history_max_storage_mb: liveLimitInput
      ? Number(liveLimitInput.value)
      : host._settings.activity_history_max_storage_mb,
  };
  if (warning) warning.innerHTML = activityStorageLimitWarning(settings);
  progress.innerHTML = activityStorageProgress(settings);
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
        <h2>Settings</h2>
        <p class="muted">Loading settings…</p>
      </div>
    `;
  }

  const settings = host._settings;
  const storageLimitValue = String(settings.activity_history_max_storage_mb || 0);
  return `
    <div class="card">
      <form data-settings-form>
        <div class="section-heading settings-heading">
          <h2>Settings</h2>
          <button class="action settings-save" type="submit" ${host._settingsDirty && !host._settingsSaving ? "" : "disabled"}>${icons.save}<span>Save</span></button>
        </div>
        <fieldset>
          <legend>Camera Options</legend>
          ${cameraOptionsTable(host)}
        </fieldset>

        <fieldset>
          <legend>Panel Options</legend>
          <label class="check">
            <input name="store_activity_history" type="checkbox" ${settings.store_activity_history ? "checked" : ""}>
            Store activity history and preview images locally
          </label>
          <div data-activity-storage-limit-controls ${settings.store_activity_history ? "" : "hidden"}>
            <div data-activity-storage-limit-warning>${activityStorageLimitWarning(settings)}</div>
            <label class="activity-storage-limit-row">
              <span class="activity-storage-limit">
                <input name="activity_history_max_storage_mb" type="number" min="0" value="${escapeHtml(storageLimitValue)}" style="--storage-limit-digits: ${Math.max(1, storageLimitValue.length)}" aria-label="Local activity storage limit in MB">
                <span class="activity-storage-limit-unit" data-activity-storage-limit-unit ${Number(storageLimitValue) >= 1 ? "" : "hidden"}>MB</span>
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
        </fieldset>

        <fieldset>
          <legend>Debug</legend>
          <label class="check">
            <input name="debug_logging" type="checkbox" ${settings.debug_logging ? "checked" : ""}> Enable debug logging
          </label>
        </fieldset>

        ${sipAccountsSection(settings.sip_accounts)}

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

  const settingsForm = event.currentTarget;
  const form = new FormData(settingsForm);
  host._settingsSaving = true;
  try {
    const saved = {
      store_activity_history: form.get("store_activity_history") === "on",
      activity_history_max_storage_mb: Number(form.get("activity_history_max_storage_mb")),
      custom_camera_stream_orientations: true,
      camera_stream_orientations: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-stream-orientation]")].map((select) => [select.dataset.streamOrientation, select.value])
      ),
      custom_activity_image_orientations: true,
      activity_image_orientations: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-activity-orientation]")].map((select) => [select.dataset.activityOrientation, select.value])
      ),
      debug_logging: form.get("debug_logging") === "on",
    };

    const result = await host._hass.callWS({
      type: "akuvox/panel_save_settings",
      entry_id: host._activeAccount,
      ...saved,
    });

    host._settings = {
      ...host._settings,
      ...saved,
    };
    host._settingsDirty = false;
    settingsForm.dataset.settingsSignature = formSignature(settingsForm);
    settingsForm.querySelector("[type='submit']").disabled = true;
    await host._load();
    showNotice(host, "SmartPlus settings saved successfully.");
  } catch (_) {
    showNotice(
      host,
      "The SmartPlus settings could not be saved. Check that the values are valid.",
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
  settingsForm.dataset.settingsSignature = formSignature(settingsForm);
  const markSettingsDirty = () => {
    host._settingsDirty =
      formSignature(settingsForm) !== settingsForm.dataset.settingsSignature;
    const saveButton = settingsForm.querySelector("[type='submit']");
    if (saveButton) saveButton.disabled = !host._settingsDirty || host._settingsSaving;
  };
  settingsForm.addEventListener("input", markSettingsDirty);
  settingsForm.addEventListener("change", markSettingsDirty);

  const storageHistoryToggle = settingsForm.querySelector(
    '[name="store_activity_history"]'
  );
  const storageLimitControls = settingsForm.querySelector(
    "[data-activity-storage-limit-controls]"
  );
  storageHistoryToggle?.addEventListener("change", () => {
    if (storageLimitControls) storageLimitControls.hidden = !storageHistoryToggle.checked;
  });

  const storageLimitInput = settingsForm.querySelector(
    '[name="activity_history_max_storage_mb"]'
  );
  const storageLimitUnit = settingsForm.querySelector(
    "[data-activity-storage-limit-unit]"
  );
  const storageLimitDescription = settingsForm.querySelector(
    "[data-activity-storage-limit-description]"
  );
  storageLimitInput?.addEventListener("input", () => {
    storageLimitInput.style.setProperty(
      "--storage-limit-digits",
      String(Math.max(1, storageLimitInput.value.length))
    );
    const isUnlimited = Number(storageLimitInput.value) < 1;
    if (storageLimitUnit) storageLimitUnit.hidden = isUnlimited;
    if (storageLimitDescription) storageLimitDescription.hidden = !isUnlimited;
    const currentSettings = {
      ...host._settings,
      activity_history_max_storage_mb: Number(storageLimitInput.value),
    };
    const warning = settingsForm.querySelector("[data-activity-storage-limit-warning]");
    const progress = settingsForm.querySelector("[data-activity-storage-progress]");
    if (warning) warning.innerHTML = activityStorageLimitWarning(currentSettings);
    if (progress) progress.innerHTML = activityStorageProgress(currentSettings);
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

  settingsForm.querySelector("[data-export-activity-storage]")?.addEventListener("click", async () => {
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

  settingsForm.querySelectorAll("[data-stream]").forEach((button) =>
    button.addEventListener("click", () =>
      host._stream(button.dataset.stream, button.dataset.mode)
    )
  );

};
