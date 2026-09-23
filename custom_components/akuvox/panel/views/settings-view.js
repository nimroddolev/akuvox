/**
 * Settings view: Event, display, and panel options.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260829-camera-copy-visible";
import { callWsWithBlocker, confirmModal, showNotice, showPairingLinkNotice } from "../components/dialogs.js?v=20260923-pairing-link-copy-feedback";
import { CAMERA_ORIENTATION_OPTIONS } from "../utils/orientation.js?v=20260830-combined-directional-labels";

const RECEIVER_CONTACT_TIMEOUT_MS = 2 * 60 * 1000;

const receiverIsConnected = (share) => {
  if (typeof share.connected === "boolean") return share.connected;
  const lastContact = Date.parse(share.last_sync || "");
  return Boolean(
    share.activated &&
    Number.isFinite(lastContact) &&
    Date.now() - lastContact <= RECEIVER_CONTACT_TIMEOUT_MS
  );
};

const cameraOptionsTable = (host) => {
  const cameras = panelCameras(host);
  const streamOrientations = host._settings?.camera_stream_orientations || {};
  const activityOrientations = host._settings?.activity_image_orientations || {};
  return `
    <div class="table-wrap camera-options-wrap">
      <table class="camera-options-table">
        <thead><tr><th>Camera</th><th>Stream Orientation</th><th>Activity Image Orientation</th><th>RTSP Url</th></tr></thead>
        <tbody>
          ${cameras.map((camera) => `<tr>
            <td title="${escapeHtml(camera.name)}">${escapeHtml(camera.name)}</td>
            <td><select name="camera_stream_orientation" data-stream-orientation="${escapeHtml(camera.sourceName)}" aria-label="${escapeHtml(camera.name)} stream orientation">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${streamOrientations[camera.sourceName] === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
            <td><select name="activity_image_orientation" data-activity-orientation="${escapeHtml(camera.sourceName)}" aria-label="${escapeHtml(camera.name)} activity image orientation">${CAMERA_ORIENTATION_OPTIONS.map(([value, label]) => `<option value="${value}" ${activityOrientations[camera.sourceName] === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
            <td><button class="action camera-copy-rtsp" type="button" data-stream="${escapeHtml(camera.sourceName)}" data-mode="copy" aria-label="Copy RTSP link" title="Copy RTSP link">${icons.copy}</button></td>
          </tr>`).join("") || '<tr><td colspan="4" class="muted">No cameras are currently available for this account.</td></tr>'}
        </tbody>
      </table>
    </div>`;
};

const panelCameras = (host) => [...new Map(
  (host._account()?.cameras || [])
    .filter((camera) => camera.name)
    .map((camera) => {
      const sourceName = camera.source_name || camera.name;
      return [sourceName, { name: camera.name, sourceName }];
    })
).values()].sort((left, right) => left.name.localeCompare(right.name));

const eventOptions = (host) => {
  const settings = host._settings || {};
  const cameras = panelCameras(host);
  const overrides = settings.event_image_wait_overrides || {};
  return `<fieldset>
    <legend>Events</legend>
    <label class="check"><input name="wait_for_event_image" type="checkbox" ${settings.wait_for_event_image !== false ? "checked" : ""}> Wait for an image URL before firing a door event</label>
    <label class="check"><input name="custom_event_image_wait" type="checkbox" ${settings.custom_event_image_wait ? "checked" : ""}> Configure image waiting for each device</label>
    <div data-event-image-overrides ${settings.custom_event_image_wait ? "" : "hidden"}>
      ${cameras.map((camera) => `<label class="check"><input type="checkbox" data-event-image-wait="${escapeHtml(camera.sourceName)}" ${overrides[camera.sourceName] !== undefined ? (overrides[camera.sourceName] ? "checked" : "") : (settings.wait_for_event_image !== false ? "checked" : "")}> ${escapeHtml(camera.name)}</label>`).join("") || '<p class="muted">No devices are currently available.</p>'}
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

const relativeContactTime = (value) => {
  const elapsed = Math.max(0, Date.now() - Date.parse(value || ""));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Last contacted just now";
  if (minutes < 60) return `Last contacted ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last contacted ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Last contacted ${days} day${days === 1 ? "" : "s"} ago`;
};

const relativeTime = (value) => {
  const elapsed = Math.max(0, Date.now() - Date.parse(value || ""));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const remoteShareConnectionSection = (lastSync) => {
  const lastContact = Date.parse(lastSync || "");
  const connected = Number.isFinite(lastContact) && Date.now() - lastContact <= RECEIVER_CONTACT_TIMEOUT_MS;
  const status = connected ? "Connected" : "Connection delayed";
  const detail = Number.isFinite(lastContact)
    ? `Last connected ${relativeTime(lastSync)}`
    : "Waiting for the first connection";
  return `<p data-remote-share-connection class="credential-share-source-status ${connected ? "connected" : "waiting"}"><span>${connected ? "🟢" : "🟡"}</span> <strong>${status}</strong> · ${escapeHtml(detail)}</p>`;
};

/** Refresh receiver connection status without rebuilding the Settings form. */
export const updateRemoteShareConnectionStatus = (host, lastSync) => {
  const status = host.shadowRoot?.querySelector("[data-remote-share-connection]");
  if (status) status.outerHTML = remoteShareConnectionSection(lastSync);
};

const pairedReceiversSection = (shares = []) => {
  if (!shares.length) return "";
  return `<div class="credential-share-receivers">
    <h3>Paired Home Assistants</h3>
    ${shares.map((share) => {
      const expiresAt = Date.parse(share.expires_at || "");
      const pendingExpired = !share.activated && (!Number.isFinite(expiresAt) || expiresAt <= Date.now());
      const status = pendingExpired ? "Pairing link expired" : share.revoked ? "Revoked" : !share.activated ? "Waiting to pair" : receiverIsConnected(share) ? "Connected" : "Disconnected";
      const statusClass = status === "Connected" ? "connected" : status === "Waiting to pair" ? "waiting" : "disconnected";
      const statusIndicator = status === "Connected" ? "🟢" : status === "Waiting to pair" ? "🟡" : status === "Pairing link expired" || status === "Revoked" ? "❌" : "🔴";
      const detail = status === "Waiting to pair"
        ? ` · Pairing link expires in <span data-pairing-expiry="${expiresAt}">${formatPairingTimeRemaining(expiresAt - Date.now())}</span>`
        : share.last_sync ? ` · ${relativeContactTime(share.last_sync)}` : "";
      return `<div class="credential-share-receiver-row">
        <span class="credential-share-status ${statusClass}"><span class="credential-share-indicator">${statusIndicator}</span><strong>${escapeHtml(share.receiver_name)}</strong><small>${escapeHtml(status)}${detail}</small></span>
        <span class="credential-share-actions"><button class="action" type="button" data-view-credential-share="${escapeHtml(share.share_id)}">View</button>${share.revoked
          ? `<button class="danger key-menu-button" type="button" data-delete-credential-share="${escapeHtml(share.share_id)}" aria-label="Delete paired Home Assistant" title="Delete paired Home Assistant">${icons.trash}</button>`
          : `<button class="action" type="button" data-revoke-credential-share="${escapeHtml(share.share_id)}">Revoke</button>`}</span>
      </div>`;
    }).join("")}
  </div>`;
};

const requestShareAccess = (host, viewedShare = null) => new Promise((resolve) => {
  const readOnly = viewedShare !== null;
  const account = host._account() || {};
  const existingReceiverNames = new Set(
    (host._settings?.credential_shares || [])
      .map((share) => String(share.receiver_name || "").trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  const cameras = new Map((account.cameras || []).map((item) => [item.source_name || item.name, item]));
  const relays = account.relays || [];
  const names = [...new Set([...cameras.keys(), ...relays.map((item) => item.source_name || item.name)])].sort();
  const selectedDeviceIds = new Set(viewedShare?.device_ids || []);
  const createRelayIds = new Set(viewedShare?.create_key_relay_ids || []);
  const editRelayIds = new Set(viewedShare?.edit_key_relay_ids || []);
  const viewRelayIds = new Set(viewedShare?.view_key_relay_ids || []);
  const activityDeviceNames = new Set(viewedShare?.activity_device_names || []);
  const checked = (value, enabled = true) => (!readOnly || (enabled && value)) ? "checked" : "";
  const disabled = readOnly ? "disabled" : "";
  const readOnlyCheck = (enabled) => `<span class="share-readonly-check${enabled ? " enabled" : ""}">${enabled ? "✓" : ""}</span>`;
  const checkbox = (attribute, value, inputValue = "") => readOnly
    ? readOnlyCheck(value)
    : `<input ${attribute} type="checkbox" value="${escapeHtml(inputValue)}" ${checked(value)}>`;
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "share-access-dialog";
  dialog.classList.toggle("theme-dark", Boolean(host._hass?.themes?.darkMode));
  const hasMultipleRelays = relays.some((relay) => relays.filter((item) => (item.source_name || item.name) === (relay.source_name || relay.name)).length > 1);
  const relayIds = relays.map((relay) => `relay:${relay.mac}:${relay.relay_id}`);
  const allCameras = cameras.size > 0 && [...cameras.values()].every((camera) => selectedDeviceIds.has(`camera:${camera.source_name || camera.name}`));
  const allRelays = relayIds.length > 0 && relayIds.every((id) => selectedDeviceIds.has(id));
  const allActivity = names.length > 0 && names.every((name) => activityDeviceNames.has(name));
  const allView = relayIds.length > 0 && relayIds.every((id) => viewRelayIds.has(id));
  const allCreate = relayIds.length > 0 && relayIds.every((id) => createRelayIds.has(id));
  const allEdit = relayIds.length > 0 && relayIds.every((id) => editRelayIds.has(id));
  const deviceRows = names.map((name) => {
    const camera = cameras.get(name);
    const deviceRelays = relays.filter((item) => (item.source_name || item.name) === name);
    const displayName = camera?.name || deviceRelays[0]?.name || name;
    const relayCell = deviceRelays.map((relay) => {
      const relayId = `relay:${relay.mac}:${relay.relay_id}`;
      return `<label class="check">${checkbox("data-share-relay", selectedDeviceIds.has(relayId), relayId)} ${hasMultipleRelays ? escapeHtml(relay.door_name || `Relay ${relay.relay_id}`) : ""}</label>`;
    }).join("<br>");
    const permitsCreate = deviceRelays.length > 0 && deviceRelays.every((relay) => createRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const permitsEdit = deviceRelays.length > 0 && deviceRelays.every((relay) => editRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const permitsView = deviceRelays.length > 0 && deviceRelays.every((relay) => viewRelayIds.has(`relay:${relay.mac}:${relay.relay_id}`));
    const cameraId = `camera:${camera?.source_name || camera?.name}`;
    const keyPermissionCell = (attribute, enabled) => deviceRelays.length
      ? checkbox(attribute, enabled)
      : '<span class="share-empty-cell">—</span>';
    return `<tr><td>${escapeHtml(displayName)}</td><td>${camera ? checkbox("data-share-device", selectedDeviceIds.has(cameraId), cameraId) : '<span class="share-empty-cell">—</span>'}</td><td>${relayCell || '<span class="share-empty-cell">—</span>'}</td><td>${checkbox("data-share-activity", activityDeviceNames.has(name), name)}</td><td>${keyPermissionCell("data-view-keys", permitsView)}</td><td>${keyPermissionCell("data-create-keys", permitsCreate)}</td><td>${keyPermissionCell("data-edit-keys", permitsEdit)}</td></tr>`;
  }).join("");
  const selectAllRow = `<tr class="share-select-all-row"><td>Select all</td><td>${checkbox("data-all-camera", allCameras)}</td><td>${checkbox("data-all-relay", allRelays)}</td><td>${checkbox("data-all-activity", allActivity)}</td><td>${checkbox("data-all-view", allView)}</td><td>${checkbox("data-all-create", allCreate)}</td><td>${checkbox("data-all-edit", allEdit)}</td></tr>`;
  const accessExpiresAt = viewedShare?.access_expires_at;
  const basics = readOnly
    ? `<fieldset class="share-basics"><legend>Pairing Details</legend><span>${accessExpiresAt ? `Expires at ${escapeHtml(new Date(accessExpiresAt).toLocaleString())}` : "Never expire"}</span></fieldset>`
    : `<fieldset class="share-basics"><legend>Pairing Details</legend><label>Name<input data-receiver-name maxlength="100" required></label><label class="check"><input data-never-expire name="access-duration" type="radio" checked> Never expire</label><label class="check" data-access-expiry-row><input data-expiring name="access-duration" type="radio"> Expires at<input data-access-expiry type="datetime-local" disabled></label></fieldset>`;
  dialog.innerHTML = `<h2>${readOnly ? escapeHtml(viewedShare.receiver_name) : "Create Pairing Link"}</h2>${basics}<p class="notice share-error" data-share-error hidden></p><fieldset><legend>Share access</legend><div class="table-wrap"><table class="share-access-table"><thead><tr><th colspan="4">Device</th><th colspan="3">Temporary Keys</th></tr><tr><th>Name</th><th>Camera</th><th>${hasMultipleRelays ? "Relays" : "Relay"}</th><th>Activity</th><th>View</th><th>Create</th><th>Edit</th></tr></thead><tbody>${selectAllRow}${deviceRows}</tbody></table></div></fieldset><div class="modal-actions"><button class="modal-cancel" data-cancel type="button">${readOnly ? "Close" : "Cancel"}</button>${readOnly ? "" : '<button class="modal-action" data-confirm type="button">Create</button>'}</div>`;
  const devices = [...dialog.querySelectorAll("[data-share-device], [data-share-relay]")];
  const activity = [...dialog.querySelectorAll("[data-share-activity]")];
  const neverExpire = dialog.querySelector("[data-never-expire]");
  const expires = dialog.querySelector("[data-expiring]");
  const expiry = dialog.querySelector("[data-access-expiry]");
  const syncSelectAll = (master, inputs) => {
    if (!master || !inputs.length) return;
    const selected = inputs.filter((item) => item.checked).length;
    master.checked = selected === inputs.length;
    master.indeterminate = selected > 0 && selected < inputs.length;
  };
  const wireSelectAll = (masterSelector, itemSelector) => {
    const master = dialog.querySelector(masterSelector);
    const inputs = [...dialog.querySelectorAll(itemSelector)];
    master?.addEventListener("change", () => {
      inputs.forEach((input) => { input.checked = master.checked; });
    });
    inputs.forEach((input) => input.addEventListener("change", () => {
      syncSelectAll(master, inputs);
    }));
  };
  wireSelectAll("[data-all-camera]", "[data-share-device]");
  wireSelectAll("[data-all-relay]", "[data-share-relay]");
  wireSelectAll("[data-all-activity]", "[data-share-activity]");
  wireSelectAll("[data-all-view]", "[data-view-keys]");
  wireSelectAll("[data-all-create]", "[data-create-keys]");
  wireSelectAll("[data-all-edit]", "[data-edit-keys]");
  const updateExpiryState = () => {
    if (expiry) expiry.disabled = !expires?.checked;
  };
  neverExpire?.addEventListener("change", updateExpiryState);
  expires?.addEventListener("change", updateExpiryState);
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-confirm]")?.addEventListener("click", () => {
    const name = dialog.querySelector("[data-receiver-name]").value.trim();
    const error = dialog.querySelector("[data-share-error]");
    if (!name || (!neverExpire.checked && !expiry.value)) {
      error.textContent = !name ? "Enter a name." : "Choose an access expiry date.";
      error.hidden = false;
      return;
    }
    const hasSelectedDeviceField = [...dialog.querySelectorAll("tbody tr:not(.share-select-all-row) input[type='checkbox']")]
      .some((input) => input.checked);
    if (!hasSelectedDeviceField) {
      error.textContent = "Select at least one device option to share.";
      error.hidden = false;
      return;
    }
    if (existingReceiverNames.has(name.toLocaleLowerCase())) {
      error.textContent = "A paired Home Assistant already uses this receiver name.";
      error.hidden = false;
      return;
    }
    const relayIdsFor = (permissionSelector) => [...dialog.querySelectorAll("tbody tr")]
      .filter((row) => row.querySelector(permissionSelector)?.checked)
      .flatMap((row) => [...row.querySelectorAll("[data-share-relay]")]
        .filter((relay) => relay.checked)
        .map((relay) => relay.value));
    const createKeyRelayIds = relayIdsFor("[data-create-keys]");
    const editKeyRelayIds = relayIdsFor("[data-edit-keys]");
    const viewKeyRelayIds = relayIdsFor("[data-view-keys]");
    const activityDeviceNames = activity.filter((item) => item.checked).map((item) => item.value);
    resolve({ receiverName: name, deviceIds: devices.filter((item) => item.checked).map((item) => item.value), allowActivity: activityDeviceNames.length > 0, activityDeviceNames, allowCreateKeys: createKeyRelayIds.length > 0, allowEditKeys: editKeyRelayIds.length > 0, createKeyRelayIds, editKeyRelayIds, viewKeyRelayIds, accessExpiresAt: neverExpire.checked ? null : new Date(expiry.value).toISOString() });
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
    host._requestLoad?.();
    resolve(null);
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  host.shadowRoot.append(dialog); dialog.showModal();
});

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
          <legend>Share Access</legend>
          <p class="muted">This Home Assistant receives credentials from another instance. Manage pairing on the source instance.</p>
          ${remoteShareConnectionSection(settings.remote_last_sync)}
        </fieldset>` : `
        <fieldset>
          <legend>Share Access</legend>
          <p class="muted">Generate a pairing link to securely share your Akuvox SmartPlus devices with another Home Assistant instance running the integration.<br>You can select which devices to share and whether temporary keys can be created or edited.</p>
          <button class="action" type="button" data-create-credential-share>Create Pairing Link</button>
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
  window.clearInterval(host._pairingExpiryTimer);
  const updatePairingExpiry = () => {
    host.shadowRoot.querySelectorAll("[data-pairing-expiry]").forEach((element) => {
      const remaining = Number(element.dataset.pairingExpiry) - Date.now();
      if (remaining <= 0) {
        window.clearInterval(host._pairingExpiryTimer);
        host._requestLoad?.({ forceRender: true });
      } else {
        element.textContent = formatPairingTimeRemaining(remaining);
      }
    });
  };
  if (host.shadowRoot.querySelector("[data-pairing-expiry]")) {
    host._pairingExpiryTimer = window.setInterval(updatePairingExpiry, 1000);
    updatePairingExpiry();
  }
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
    const access = await requestShareAccess(host);
    if (!access) return;
    const receiverName = access.receiverName;
    try {
      const response = await callWsWithBlocker(host, {
        type: "akuvox/panel_create_credential_share",
        entry_id: host._activeAccount,
        receiver_name: receiverName,
        source_url: window.location.origin,
        device_ids: access.deviceIds,
        allow_activity: access.allowActivity,
        activity_device_names: access.activityDeviceNames,
        allow_create_keys: access.allowCreateKeys,
        allow_edit_keys: access.allowEditKeys,
        create_key_relay_ids: access.createKeyRelayIds,
        edit_key_relay_ids: access.editKeyRelayIds,
        view_key_relay_ids: access.viewKeyRelayIds,
        access_expires_at: access.accessExpiresAt,
      });
      await showPairingLinkNotice(host, response.pairing_link);
      host._requestLoad?.({ forceRender: true });
    } catch (error) {
      const message = String(error?.message || "");
      const reloadRequired = message.includes("source_url")
        && message.includes("extra keys not allowed");
      showNotice(
        host,
        reloadRequired
          ? "Reload the Akuvox SmartPlus integration on this Home Assistant, then generate the pairing link again."
          : message || "Could not create a pairing link.",
        reloadRequired ? "Reload required" : "Pairing failed"
      );
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

  settingsForm.querySelectorAll("[data-view-credential-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const share = host._settings?.credential_shares?.find(
        (item) => item.share_id === button.dataset.viewCredentialShare
      );
      if (share) requestShareAccess(host, share);
    });
  });

  settingsForm.querySelectorAll("[data-delete-credential-share]").forEach((button) => {
    button.addEventListener("click", async () => {
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
