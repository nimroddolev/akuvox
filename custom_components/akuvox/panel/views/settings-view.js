/**
 * Settings view: Event, display, and panel options.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260829-camera-copy-visible";
import { callWsWithBlocker, confirmModal, showNotice, showPairingLinkNotice } from "../components/dialogs.js?v=20260916-pairing-one-time-warning";
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

const eventOptions = (host) => {
  const settings = host._settings || {};
  const cameras = [...new Set((host._account()?.cameras || []).map((camera) => camera.name).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  const overrides = settings.event_image_wait_overrides || {};
  return `<fieldset>
    <legend>Events</legend>
    <label class="check"><input name="wait_for_event_image" type="checkbox" ${settings.wait_for_event_image !== false ? "checked" : ""}> Wait for an image URL before firing a door event</label>
    <label class="check"><input name="custom_event_image_wait" type="checkbox" ${settings.custom_event_image_wait ? "checked" : ""}> Configure image waiting for each device</label>
    <div data-event-image-overrides ${settings.custom_event_image_wait ? "" : "hidden"}>
      ${cameras.map((camera) => `<label class="check"><input type="checkbox" data-event-image-wait="${escapeHtml(camera)}" ${overrides[camera] !== undefined ? (overrides[camera] ? "checked" : "") : (settings.wait_for_event_image !== false ? "checked" : "")}> ${escapeHtml(camera)}</label>`).join("") || '<p class="muted">No devices are currently available.</p>'}
    </div>
  </fieldset>`;
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

const formatPairingTimeRemaining = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const pairedReceiversSection = (shares = []) => {
  if (!shares.length) return "";
  return `<div class="credential-share-receivers">
    <h3>Paired Home Assistants</h3>
    ${shares.map((share) => {
      const status = share.revoked ? "Revoked" : share.activated ? "Connected" : "Waiting to pair";
      const lastSync = share.revoked
        ? ""
        : share.last_sync ? ` · ${new Date(share.last_sync).toLocaleString()}` : " · Not yet synced";
      return `<div class="credential-share-receiver-row">
        <span><strong>${escapeHtml(share.receiver_name)}</strong><small>${escapeHtml(status + lastSync)}</small></span>
        ${share.revoked
          ? `<button class="danger key-menu-button" type="button" data-delete-credential-share="${escapeHtml(share.share_id)}" aria-label="Delete paired Home Assistant" title="Delete paired Home Assistant">${icons.trash}</button>`
          : `<button class="action" type="button" data-revoke-credential-share="${escapeHtml(share.share_id)}">Revoke</button>`}
      </div>`;
    }).join("")}
  </div>`;
};

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
          ${eventOptions(host)}
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

        ${settings.credential_mode === "remote" ? `
        <fieldset>
          <legend>Credential Sharing</legend>
          <p class="muted">This Home Assistant receives credentials from another instance. Manage pairing on the source instance.</p>
        </fieldset>` : `
        <fieldset>
          <legend>Credential Sharing</legend>
          <p class="muted">Create a one-time pairing link for another Home Assistant. The link expires after 10 minutes.</p>
          <label>Receiver name<input data-share-receiver-name maxlength="100" placeholder="e.g. Holiday home"></label>
          <button class="action" type="button" data-create-credential-share>Create pairing link</button>
          <div data-credential-share-result></div>
          ${pairedReceiversSection(settings.credential_shares)}
        </fieldset>`}

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
      wait_for_event_image: form.get("wait_for_event_image") === "on",
      custom_event_image_wait: form.get("custom_event_image_wait") === "on",
      event_image_wait_overrides: Object.fromEntries(
        [...settingsForm.querySelectorAll("[data-event-image-wait]")].map((input) => [input.dataset.eventImageWait, input.checked])
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
  const eventOverrideToggle = settingsForm.querySelector('[name="custom_event_image_wait"]');
  const eventOverrides = settingsForm.querySelector("[data-event-image-overrides]");
  eventOverrideToggle?.addEventListener("change", () => {
    if (eventOverrides) eventOverrides.hidden = !eventOverrideToggle.checked;
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

  settingsForm.querySelector("[data-create-credential-share]")?.addEventListener("click", async () => {
    const receiver = settingsForm.querySelector("[data-share-receiver-name]");
    const result = settingsForm.querySelector("[data-credential-share-result]");
    const receiverName = receiver?.value?.trim();
    if (!receiverName) {
      showNotice(host, "Enter a name for the receiving Home Assistant.", "Receiver name required");
      receiver?.focus();
      return;
    }
    try {
      const response = await callWsWithBlocker(host, {
        type: "akuvox/panel_create_credential_share",
        entry_id: host._activeAccount,
        receiver_name: receiverName,
      });
      if (result) {
        const expiresAt = Date.now() + 10 * 60 * 1000;
        result.innerHTML = `<label>
          <span class="credential-share-link-heading">Pairing link (<span data-credential-share-expiry>expires in 10:00</span>)</span>
          <span class="credential-share-link-row">
            <span class="credential-share-link-name">${escapeHtml(receiverName)}</span>
            <input readonly aria-label="Pairing link for ${escapeHtml(receiverName)}" value="${escapeHtml(response.pairing_link)}">
            <button class="action" type="button" data-copy-credential-share>Copy</button>
          </span>
        </label>`;
        result.querySelector("input")?.select();
        const expiry = result.querySelector("[data-credential-share-expiry]");
        const updateExpiry = () => {
          if (!result.isConnected || !expiry?.isConnected) {
            window.clearInterval(expiryTimer);
            return;
          }
          const remaining = expiresAt - Date.now();
          expiry.textContent = remaining > 0
            ? `expires in ${formatPairingTimeRemaining(remaining)}`
            : "expired";
          if (remaining <= 0) window.clearInterval(expiryTimer);
        };
        const expiryTimer = window.setInterval(updateExpiry, 1000);
        updateExpiry();
        result.querySelector("[data-copy-credential-share]")?.addEventListener("click", async (event) => {
          const copyButton = event.currentTarget;
          try {
            await host.shadowRoot.ownerDocument.defaultView.navigator.clipboard.writeText(response.pairing_link);
            copyButton.textContent = "Copied";
            copyButton.disabled = true;
          } catch (_) {
            showNotice(host, "Could not copy automatically. Select the link and copy it manually.", "Copy failed");
          }
        });
      }
      showPairingLinkNotice(host, response.pairing_link);
    } catch (error) {
      showNotice(host, error?.message || "Could not create a pairing link.", "Pairing failed");
    }
  });

  settingsForm.querySelectorAll("[data-revoke-credential-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmModal(
        host,
        "This immediately prevents this Home Assistant from receiving future Akuvox credentials.",
        "Revoke paired Home Assistant?",
        "Revoke"
      );
      if (!confirmed) return;
      try {
        await callWsWithBlocker(host, {
          type: "akuvox/panel_revoke_credential_share",
          entry_id: host._activeAccount,
          share_id: button.dataset.revokeCredentialShare,
        });
        await host._load();
      } catch (error) {
        showNotice(host, error?.message || "Could not revoke the paired Home Assistant.", "Revoke failed");
      }
    });
  });

  settingsForm.querySelectorAll("[data-delete-credential-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = await confirmModal(
        host,
        "This permanently removes the revoked receiver record from this Home Assistant.",
        "Delete revoked receiver?",
        "Delete"
      );
      if (!confirmed) return;
      try {
        await callWsWithBlocker(host, {
          type: "akuvox/panel_delete_credential_share",
          entry_id: host._activeAccount,
          share_id: button.dataset.deleteCredentialShare,
        });
        await host._load();
      } catch (error) {
        showNotice(host, error?.message || "Could not delete the revoked receiver.", "Delete failed");
      }
    });
  });

  settingsForm.querySelectorAll("[data-stream]").forEach((button) =>
    button.addEventListener("click", () =>
      host._stream(button.dataset.stream, button.dataset.mode)
    )
  );

};
