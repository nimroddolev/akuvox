/**
 * Settings view: Event, display, and panel options.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260930-notification-bell-v5";
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
            <td><button class="camera-copy-rtsp" type="button" data-stream="${escapeHtml(camera.sourceName)}" data-mode="copy" aria-label="Copy RTSP link" title="Copy RTSP link">${icons.copy}<span>Copy RTSP</span></button></td>
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

const notificationDoors = (host) => {
  const doors = new Map();
  const addDoor = (item) => {
    const deviceId = item?.device_id;
    if (!deviceId || doors.has(deviceId)) return;
    doors.set(deviceId, { name: item.name || item.door_name || "Unnamed door", deviceId });
  };
  const account = host._account?.() || {};
  (account.cameras || []).forEach(addDoor);
  (account.relays || []).forEach(addDoor);
  return [...doors.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const notificationServices = (host) => Object.keys(host._hass?.services?.notify || {})
  .sort()
  .map((service) => ({
    service: `notify.${service}`,
    name: service.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));

const notificationAction = (service, withImage) => ({
  action: service,
  data: {
    title: "{{ trigger.event.data.Location }} {% if trigger.event.data.CaptureType == 'Call' %}doorbell{% else %}opened{% endif %}",
    message: "{{ 'Someone is calling from the ' ~ trigger.event.data.Location ~ ' door' if trigger.event.data.CaptureType == 'Call' else 'The ' ~ trigger.event.data.Location ~ ' door was opened by ' ~ (trigger.event.data.Initiator | default('Unknown', true)) }}",
    ...(withImage ? { data: { image: "{{ trigger.event.data.PicUrl }}" } } : {}),
  },
});

const suggestedAutomationName = (doors) => doors.length === 1
  ? `Notify when ${doors[0].name} opens`
  : "Notify when selected Akuvox doors open";

const buildDoorNotificationAutomation = ({ name, doors, services, includeOpened, includeCalls }) => {
  const captureTypes = [
    ...(includeOpened ? ["Face Unlock", "Unlock on SmartPlus"] : []),
    ...(includeCalls ? ["Call"] : []),
  ];
  return {
    alias: name,
    description: "Created by Akuvox SmartPlus door-event notifications.",
    mode: "parallel",
    max: 10,
    triggers: doors.map((door) => ({
      trigger: "device",
      domain: "akuvox",
      device_id: door.deviceId,
      type: "door_unlocked",
    })),
    conditions: [{
      condition: "template",
      value_template: `{{ trigger.event.data.CaptureType in ${JSON.stringify(captureTypes)} }}`,
    }],
    actions: [{
      choose: [{
        conditions: [{
          condition: "template",
          value_template: "{{ trigger.event.data.PicUrl | default('', true) != '' }}",
        }],
        sequence: services.map((service) => notificationAction(service, true)),
      }],
      default: services.map((service) => notificationAction(service, false)),
    }],
  };
};

const requestDoorNotificationStep = (host, { title, description, content, backLabel, nextLabel, submit, bind, focusCancel = false }) => new Promise((resolve) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "door-notification-dialog";
  dialog.innerHTML = `<button class="door-notification-close" type="button" data-cancel aria-label="Close" title="Close" ${focusCancel ? "autofocus" : ""}>×</button><h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
    <form data-door-notification-form>
      ${content}
      <p class="form-error" data-door-notification-error hidden></p>
      <div class="modal-actions">${backLabel ? `<button class="modal-cancel" type="button" data-back>${escapeHtml(backLabel)}</button>` : ""}<button class="modal-action" type="submit" data-next>${escapeHtml(nextLabel)}</button></div>
    </form>`;
  const form = dialog.querySelector("[data-door-notification-form]");
  const error = dialog.querySelector("[data-door-notification-error]");
  let result = null;
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-back]")?.addEventListener("click", () => {
    result = { direction: "back" };
    dialog.close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = submit(form, error);
    if (!value) return;
    result = { direction: "next", value };
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
    resolve(result);
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  host.shadowRoot.append(dialog);
  bind?.(dialog, form);
  dialog.showModal();
});

const requestDoorNotificationAutomation = async (host) => {
  const doors = notificationDoors(host);
  const services = notificationServices(host);
  const selection = { doorIds: [], includeOpened: true, includeCalls: false, services: [], name: "" };
  let step = 0;
  while (step >= 0 && step < 4) {
    let result;
    if (step === 0) {
      result = await requestDoorNotificationStep(host, {
        title: "Select Doors", description: "Choose the doors that should send notifications.", nextLabel: "Next", focusCancel: true,
        content: `<div class="door-picker-control"><label class="door-picker-search"><input type="search" data-door-search aria-label="Search doors" placeholder="Type to filter doors" autocomplete="off"></label><div class="door-picker" data-door-picker hidden><div class="door-picker-results" data-door-picker-results role="listbox"></div></div></div><div class="door-picker-badges" data-door-picker-badges aria-label="Selected doors"></div>`,
        bind: (dialog) => {
          const search = dialog.querySelector("[data-door-search]");
          const picker = dialog.querySelector("[data-door-picker]");
          const results = dialog.querySelector("[data-door-picker-results]");
          const badges = dialog.querySelector("[data-door-picker-badges]");
          const nextButton = dialog.querySelector("[data-next]");
          const render = () => {
            nextButton.disabled = selection.doorIds.length === 0;
            const query = search.value.trim().toLocaleLowerCase();
            const available = doors.filter((door) => !selection.doorIds.includes(door.deviceId));
            const matching = available.filter((door) => door.name.toLocaleLowerCase().includes(query));
            badges.innerHTML = selection.doorIds.map((deviceId) => {
              const door = doors.find((item) => item.deviceId === deviceId);
              return door ? `<button class="door-selection-badge" type="button" data-remove-door="${escapeHtml(deviceId)}"><span>${escapeHtml(door.name)}</span><span aria-hidden="true">×</span><span class="sr-only">Remove ${escapeHtml(door.name)}</span></button>` : "";
            }).join("");
            results.innerHTML = matching.map((door) => `<button class="door-picker-option" type="button" role="option" data-add-door="${escapeHtml(door.deviceId)}">${escapeHtml(door.name)}</button>`).join("") || `<p class="muted">${available.length ? "No matching doors." : "All available doors are selected."}</p>`;
            results.querySelectorAll("[data-add-door]").forEach((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
            badges.querySelectorAll("[data-remove-door]").forEach((button) => button.addEventListener("click", () => {
              selection.doorIds = selection.doorIds.filter((deviceId) => deviceId !== button.dataset.removeDoor);
              render();
            }));
            results.querySelectorAll("[data-add-door]").forEach((button) => button.addEventListener("click", () => {
              selection.doorIds = [...selection.doorIds, button.dataset.addDoor];
              search.value = "";
              render();
              picker.hidden = true;
              search.blur();
            }));
          };
          search.addEventListener("focus", () => { picker.hidden = false; });
          search.addEventListener("input", () => { picker.hidden = false; render(); });
          search.addEventListener("blur", () => window.setTimeout(() => { picker.hidden = true; }, 100));
          render();
        },
        submit: (_form, error) => {
          if (selection.doorIds.length) return { doorIds: selection.doorIds };
          error.textContent = "Select at least one door."; error.hidden = false; return null;
        },
      });
    } else if (step === 1) {
      result = await requestDoorNotificationStep(host, {
        title: "Select Event Types", description: "Choose which door events should create a notification.", backLabel: "Back", nextLabel: "Next",
        content: `<fieldset><legend>Event types</legend><label class="door-notification-option"><input type="checkbox" name="opened" ${selection.includeOpened ? "checked" : ""}><span>Door opened / unlocked</span></label><label class="door-notification-option"><input type="checkbox" name="call" ${selection.includeCalls ? "checked" : ""}><span>Doorbell call</span></label></fieldset>`,
        submit: (form, error) => {
          const includeOpened = form.querySelector('[name="opened"]').checked;
          const includeCalls = form.querySelector('[name="call"]').checked;
          if (includeOpened || includeCalls) return { includeOpened, includeCalls };
          error.textContent = "Select at least one event type."; error.hidden = false; return null;
        },
      });
    } else if (step === 2) {
      result = await requestDoorNotificationStep(host, {
        title: "Notify Via", description: "Choose one or more Home Assistant notification services.", backLabel: "Back", nextLabel: "Next",
        content: services.length
          ? `<div class="door-picker-control notification-service-picker-control"><label class="door-picker-search"><input type="search" data-service-search aria-label="Search notification services" placeholder="Type to filter notification services" autocomplete="off"></label><div class="door-picker" data-service-picker hidden><div class="door-picker-results" data-service-picker-results role="listbox"></div></div></div><div class="door-picker-badges" data-notification-service-badges aria-label="Selected notification services"></div>`
          : '<p class="muted">No notification services are available.</p>',
        bind: (dialog) => {
          const search = dialog.querySelector("[data-service-search]");
          const picker = dialog.querySelector("[data-service-picker]");
          const results = dialog.querySelector("[data-service-picker-results]");
          const badges = dialog.querySelector("[data-notification-service-badges]");
          const serviceById = new Map(services.map((service) => [service.service, service]));
          if (!search || !picker || !results || !badges) return;
          const render = () => {
            const query = search.value.trim().toLocaleLowerCase();
            const available = services.filter((service) => !selection.services.includes(service.service));
            const matching = available.filter((service) => service.name.toLocaleLowerCase().includes(query));
            badges.innerHTML = selection.services.map((serviceId) => {
              const service = serviceById.get(serviceId);
              return service ? `<button class="door-selection-badge" type="button" data-remove-service="${escapeHtml(serviceId)}"><span>${escapeHtml(service.name)}</span><span aria-hidden="true">×</span><span class="sr-only">Remove ${escapeHtml(service.name)}</span></button>` : "";
            }).join("");
            results.innerHTML = matching.map((service) => `<button class="door-picker-option notification-service-action-option" type="button" role="option" data-add-service="${escapeHtml(service.service)}"><span class="notification-service-action-icon">${icons.bell}</span><span class="notification-service-action-copy"><span>Send a notification with ${escapeHtml(service.name)}</span><small>Sends a notification message using the ${escapeHtml(service.name)} service.</small></span><span class="notification-service-action-domain">notify</span></button>`).join("") || `<p class="muted">${available.length ? "No matching notification services." : "All available notification services are selected."}</p>`;
            results.querySelectorAll("[data-add-service]").forEach((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
            badges.querySelectorAll("[data-remove-service]").forEach((button) => button.addEventListener("click", () => {
              selection.services = selection.services.filter((service) => service !== button.dataset.removeService);
              render();
            }));
            results.querySelectorAll("[data-add-service]").forEach((button) => button.addEventListener("click", () => {
              selection.services = [...selection.services, button.dataset.addService];
              search.value = "";
              render();
              picker.hidden = true;
              search.blur();
            }));
          };
          search.addEventListener("focus", () => { picker.hidden = false; });
          search.addEventListener("input", () => { picker.hidden = false; render(); });
          search.addEventListener("blur", () => window.setTimeout(() => { picker.hidden = true; }, 100));
          render();
        },
        submit: (_form, error) => {
          if (selection.services.length) return { services: selection.services };
          error.textContent = "Select at least one notification service."; error.hidden = false; return null;
        },
      });
    } else {
      const selectedDoors = doors.filter((door) => selection.doorIds.includes(door.deviceId));
      const defaultName = suggestedAutomationName(selectedDoors);
      result = await requestDoorNotificationStep(host, {
        title: "Confirm Automation", description: "Review the automation name, then create and enable it.", backLabel: "Back", nextLabel: "Create automation",
        content: `<label>Automation name<input name="automation-name" type="text" value="${escapeHtml(selection.name || defaultName)}" required></label>`,
        submit: (form, error) => {
          const name = form.querySelector('[name="automation-name"]').value.trim();
          if (name) return { name };
          error.textContent = "Enter an automation name."; error.hidden = false; return null;
        },
      });
    }
    if (!result) return null;
    if (result.direction === "back") { step -= 1; continue; }
    Object.assign(selection, result.value);
    step += 1;
  }
  return {
    ...selection,
    doors: doors.filter((door) => selection.doorIds.includes(door.deviceId)),
  };
};

const showDoorNotificationCreated = (host, automationId) => {
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "door-notification-dialog door-notification-complete";
  dialog.innerHTML = `<h2>Notification Automation Created</h2>
    <p>Your door-event notification is enabled and ready to use.</p>
    <div class="modal-actions"><button class="modal-cancel" type="button" data-close>Done</button><a class="modal-action" href="/config/automation/edit/${encodeURIComponent(automationId)}">Review in Automations</a></div>`;
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    host._modalCount = Math.max(0, (host._modalCount || 1) - 1);
    dialog.remove();
  }, { once: true });
  host._modalCount = (host._modalCount || 0) + 1;
  host.shadowRoot.append(dialog);
  dialog.showModal();
};

const eventOptions = (host) => {
  const settings = host._settings || {};
  const cameras = panelCameras(host);
  const overrides = settings.event_image_wait_overrides || {};
  const eventImageWaiting = settings.wait_for_event_image !== false;
  return `<div class="settings-row">
    <div><strong>Wait for event images</strong><p>Wait for an image URL before sending a door event.</p></div>
    <label class="settings-switch" aria-label="Wait for event images"><input name="wait_for_event_image" type="checkbox" ${eventImageWaiting ? "checked" : ""}><span></span></label>
  </div>
  <div class="settings-row" data-event-image-override-controls ${eventImageWaiting ? "" : "hidden"}>
    <div><strong>Apply per-device</strong><p>Set image waiting separately for each camera.</p></div>
    <label class="settings-switch" aria-label="Apply event image waiting per device"><input name="custom_event_image_wait" type="checkbox" ${settings.custom_event_image_wait ? "checked" : ""}><span></span></label>
  </div>
  <div class="settings-device-options" data-event-image-overrides ${eventImageWaiting && settings.custom_event_image_wait ? "" : "hidden"}>
    ${cameras.map((camera) => `<label class="settings-device-option"><span>${escapeHtml(camera.name)}</span><span class="settings-switch"><input type="checkbox" data-event-image-wait="${escapeHtml(camera.sourceName)}" aria-label="Wait for an event image from ${escapeHtml(camera.name)}" ${overrides[camera.sourceName] !== undefined ? (overrides[camera.sourceName] ? "checked" : "") : (settings.wait_for_event_image !== false ? "checked" : "")}><span></span></span></label>`).join("") || '<p class="muted">No cameras are currently available.</p>'}
  </div>
  <div class="settings-row door-notification-row">
    <div><strong>Door-open notifications</strong><p>Create an enabled notification automation for selected doors and event types.</p></div>
    <button class="action settings-inline-action" type="button" data-create-door-notification>${icons.plus}<span>Create automation</span></button>
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
  return `<div class="credential-share-receivers settings-subsection">
    <p class="settings-list-label">Connected nodes</p>
    ${shares.map((share) => {
      const expiresAt = Date.parse(share.expires_at || "");
      const pendingExpired = !share.activated && (!Number.isFinite(expiresAt) || expiresAt <= Date.now());
      const status = pendingExpired ? "Pairing link expired" : share.revoked ? "Revoked" : !share.activated ? "Waiting to pair" : receiverIsConnected(share) ? "Connected" : "Disconnected";
      const statusClass = status === "Connected" ? "connected" : status === "Waiting to pair" ? "waiting" : "disconnected";
      const detail = status === "Waiting to pair"
        ? `Pairing link expires in <span data-pairing-expiry="${expiresAt}">${formatPairingTimeRemaining(expiresAt - Date.now())}</span>`
        : share.last_sync ? relativeContactTime(share.last_sync) : "Waiting for the first connection";
      return `<div class="credential-share-receiver-row ${statusClass}">
        <span class="credential-share-status"><span class="remote-node-indicator" aria-hidden="true"></span><span><strong>${escapeHtml(share.receiver_name)}</strong><small><em>${escapeHtml(status)}</em>${detail ? `<span class="credential-share-separator" aria-hidden="true">·</span><span>${detail}</span>` : ""}</small></span></span>
        <span class="credential-share-actions"><button class="action credential-share-view-button" type="button" data-view-credential-share="${escapeHtml(share.share_id)}" aria-label="View paired Home Assistant" title="View paired Home Assistant">${icons.eye}</button>${share.revoked
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
  const availableDeviceIds = [
    ...cameras.values()].map((camera) => `camera:${camera.source_name || camera.name}`)
    .concat(relays.map((relay) => `relay:${relay.mac}:${relay.relay_id}`));
  const availableRelayIds = relays.map((relay) => `relay:${relay.mac}:${relay.relay_id}`);
  const selectedDeviceIds = new Set(viewedShare?.device_ids || (readOnly ? [] : availableDeviceIds));
  const createRelayIds = new Set(viewedShare?.create_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const editRelayIds = new Set(viewedShare?.edit_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const viewRelayIds = new Set(viewedShare?.view_key_relay_ids || (readOnly ? [] : availableRelayIds));
  const activityDeviceNames = new Set(viewedShare?.activity_device_names || (readOnly ? [] : names));
  const checked = (value) => value ? "checked" : "";
  const readOnlyCheck = (enabled) => `<span class="share-permission-control share-readonly-check${enabled ? " enabled" : ""}">${enabled ? "✓" : ""}</span>`;
  const checkbox = (attribute, value, inputValue = "") => readOnly
    ? readOnlyCheck(value)
    : `<span class="share-permission-control"><input ${attribute} type="checkbox" value="${escapeHtml(inputValue)}" ${checked(value)}></span>`;
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "share-access-dialog";
  dialog.classList.toggle("theme-dark", Boolean(host._hass?.themes?.darkMode));
  const hasMultipleRelays = relays.some((relay) => relays.filter((item) => (item.source_name || item.name) === (relay.source_name || relay.name)).length > 1);
  const relayIds = availableRelayIds;
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
  const selectAllRow = `<tr class="share-select-all-row"><td><span class="share-select-all-label">${icons.checklist}<span>Select all</span></span></td><td>${checkbox("data-all-camera", allCameras)}</td><td>${checkbox("data-all-relay", allRelays)}</td><td>${checkbox("data-all-activity", allActivity)}</td><td>${checkbox("data-all-view", allView)}</td><td>${checkbox("data-all-create", allCreate)}</td><td>${checkbox("data-all-edit", allEdit)}</td></tr>`;
  const accessExpiresAt = viewedShare?.access_expires_at;
  const earliestExpiry = (() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  })();
  const formattedExpiry = accessExpiresAt ? new Date(accessExpiresAt).toLocaleString() : "Never expires";
  const createdAt = viewedShare?.created_at || (() => {
    const pairingExpiry = Date.parse(viewedShare?.expires_at || "");
    return Number.isFinite(pairingExpiry) ? new Date(pairingExpiry - 10 * 60 * 1000).toISOString() : null;
  })();
  const status = viewedShare?.revoked ? "Revoked" : viewedShare?.activated ? "Connected" : "Waiting to pair";
  const basics = readOnly
    ? `<section class="share-details-card"><div class="share-detail"><span class="share-detail-icon">${icons.calendar}</span><span><small>Validity</small><strong>${escapeHtml(formattedExpiry)}</strong></span></div><div class="share-detail"><span class="share-detail-icon">${icons.calendar}</span><span><small>Registered on</small><strong>${escapeHtml(createdAt ? new Date(createdAt).toLocaleString() : "—")}</strong></span></div></section>`
    : `<section class="share-details-card share-generation-details"><label class="share-detail share-name-field"><span class="share-detail-icon">${icons.idCard}</span><span><small>Remote instance name</small><input data-receiver-name maxlength="100" required placeholder="e.g. Holiday home" autofocus></span></label><div class="share-detail share-expiry-field"><span class="share-detail-icon">${icons.calendar}</span><span><small>Validity</small><label class="check"><input data-never-expire name="access-duration" type="radio" checked> Never expires</label><label class="check" data-access-expiry-row><span><input data-expiring name="access-duration" type="radio"> Set expiry date &amp; time</span><input data-access-expiry type="datetime-local" min="${earliestExpiry}" disabled hidden></label></span></div></section>`;
  const heading = readOnly
    ? `<h2>${escapeHtml(viewedShare.receiver_name)} <span class="share-status-badge ${status.toLocaleLowerCase().replaceAll(" ", "-")}"><i></i>${escapeHtml(status)}</span></h2><p>Review the access permissions granted to this Home Assistant instance.</p>`
    : `<h2>Create pairing link</h2><p>Choose the devices and permissions available to the remote Home Assistant instance.</p>`;
  dialog.innerHTML = `<button class="share-access-close" type="button" data-cancel aria-label="Close">×</button><div class="remote-instance-dialog-header">${heading}</div>${basics}<p class="notice share-error" data-share-error hidden></p><section class="share-permissions"><div class="table-wrap"><table class="share-access-table"><thead><tr><th></th><th colspan="3"><span class="share-table-section-heading">${icons.cameraDoor}<span>Devices</span></span></th><th colspan="3"><span class="share-table-section-heading">${icons.key}<span>Temporary keys</span></span></th></tr><tr><th>Name</th><th><span class="share-permission-label">Camera</span></th><th><span class="share-permission-label">${hasMultipleRelays ? "Relays" : "Relay"}</span></th><th><span class="share-permission-label">Activity</span></th><th><span class="share-permission-label">View</span></th><th><span class="share-permission-label">Create</span></th><th><span class="share-permission-label">Edit</span></th></tr></thead><tbody>${readOnly ? "" : selectAllRow}${deviceRows}</tbody></table></div></section><div class="modal-actions"><button class="modal-cancel" data-cancel type="button">${readOnly ? "Close" : "Cancel"}</button>${readOnly ? "" : '<button class="modal-action" data-confirm type="button">Create pairing link</button>'}</div>`;
  const devices = [...dialog.querySelectorAll("[data-share-device], [data-share-relay]")];
  const activity = [...dialog.querySelectorAll("[data-share-activity]")];
  const neverExpire = dialog.querySelector("[data-never-expire]");
  const expires = dialog.querySelector("[data-expiring]");
  const expiry = dialog.querySelector("[data-access-expiry]");
  const receiverName = dialog.querySelector("[data-receiver-name]");
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
  const confirmButton = dialog.querySelector("[data-confirm]");
  const permissionInputs = [...dialog.querySelectorAll("[data-share-device], [data-share-relay], [data-share-activity], [data-view-keys], [data-create-keys], [data-edit-keys]")];
  const updateConfirmState = () => {
    if (!confirmButton) return;
    const hasSelectedPermission = permissionInputs.some((input) => input.checked);
    const expiryTime = Date.parse(expiry?.value || "");
    const hasValidExpiry = !expires?.checked || (Number.isFinite(expiryTime) && expiryTime >= Date.now());
    confirmButton.disabled = !receiverName?.value.trim() || !hasSelectedPermission || !hasValidExpiry;
  };
  dialog.addEventListener("change", updateConfirmState);
  expiry?.addEventListener("input", updateConfirmState);
  receiverName?.addEventListener("input", updateConfirmState);
  updateConfirmState();
  const updateExpiryState = () => {
    if (!expiry) return;
    const expirySelected = Boolean(expires?.checked);
    expiry.disabled = !expirySelected;
    expiry.hidden = !expirySelected;
  };
  neverExpire?.addEventListener("change", updateExpiryState);
  expires?.addEventListener("change", updateExpiryState);
  updateExpiryState();
  dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-confirm]")?.addEventListener("click", () => {
    const name = dialog.querySelector("[data-receiver-name]").value.trim();
    const error = dialog.querySelector("[data-share-error]");
    const expiryTime = Date.parse(expiry.value || "");
    if (!name || (!neverExpire.checked && (!Number.isFinite(expiryTime) || expiryTime < Date.now()))) {
      error.textContent = !name ? "Enter a name." : "Choose a future access expiry date.";
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

const activityStorageQuota = (settings) => {
  const limitMb = Number(settings.activity_history_max_storage_mb) || 0;
  const usedBytes = Math.max(0, Number(settings.activity_history_storage_bytes) || 0);
  if (limitMb <= 0) return "Unlimited local storage";
  const percentage = Math.min(100, (usedBytes / (limitMb * 1_000_000)) * 100);
  return `${formatStorageAmount(usedBytes)} / ${limitMb.toFixed(2)} MB (${percentage.toFixed(0)}%)`;
};

const sipAccountsSection = (sipAccounts = {}) => {
  const main = sipAccounts.main || {};
  const devices = Array.isArray(sipAccounts.devices) ? sipAccounts.devices : [];
  if (!main.account) {
    return `<fieldset class="settings-section sip-section"><legend>${icons.phone}<span>SIP Accounts & Extension Mapping</span></legend><p class="settings-section-description">SIP account details are not available yet. Refresh the SmartPlus account and try again.</p></fieldset>`;
  }
  return `<fieldset class="settings-section sip-section">
    <legend>${icons.phone}<span>SIP Accounts & Extension Mapping</span></legend>
    <p class="settings-section-description">Intercom credentials assigned by Akuvox Cloud for SIP telephony and door access.</p>
    <button class="action settings-inline-action sip-export" type="button" data-export-sip-accounts>${icons.idCard}<span>Export SIP accounts PDF</span></button>
    <p class="sip-warning">Security notice: These credentials allow direct two-way audio/video dialing and door access. Do not share or publish these tokens.</p>
    <div class="sip-details-grid">
      <section><h3>Core server parameters</h3><dl>
        <div><dt>SIP server</dt><dd>${escapeHtml(sipAccounts.server)}</dd></div>
        <div><dt>Transport protocol</dt><dd>${escapeHtml(sipAccounts.transport)}</dd></div>
        <div><dt>Primary account ID</dt><dd>${escapeHtml(main.account)}</dd></div>
        <div><dt>Master SIP key</dt><dd>${escapeHtml(main.password)}</dd></div>
      </dl></section>
      <section><h3>Device extensions & tokens</h3><dl>
        ${devices.map((device) => `<div><dt>${escapeHtml(device.name || device.mac || "Device")}<small>${escapeHtml(device.mac)}</small></dt><dd><span class="sip-device-extension">${escapeHtml(device.account)}</span><span class="sip-device-token">${escapeHtml(device.password || "—")}</span></dd></div>`).join("")}
      </dl></section>
    </div>
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
      <div class="modal-actions"><button class="modal-cancel" data-sip-pdf-cancel type="button">Cancel</button><button class="modal-action" value="export">Export PDF</button></div>
    </form>`;
  const form = dialog.querySelector("[data-sip-pdf-form]");
  dialog.querySelector("[data-sip-pdf-cancel]").addEventListener("click", () => dialog.close("cancel"));
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
  const quota = host.shadowRoot.querySelector("[data-activity-storage-quota]");
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
  if (quota) quota.textContent = activityStorageQuota(settings);
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
    <div class="card settings-page">
      <form data-settings-form>
        <div class="section-heading settings-heading">
          <div>
            <h2>Settings</h2>
            <p class="settings-intro">Manage how Akuvox SmartPlus works in Home Assistant.</p>
          </div>
          <div class="settings-actions">
            <button class="settings-discard" type="button" data-discard-settings ${host._settingsDirty && !host._settingsSaving ? "" : "disabled"}>${icons.restart}<span>Discard</span></button>
            <button class="action settings-save" type="submit" ${host._settingsDirty && !host._settingsSaving ? "" : "disabled"}>${icons.check}<span>Save changes</span></button>
          </div>
        </div>
        <fieldset class="settings-section">
          <legend>${icons.webcam}<span>Camera Options</span></legend>
          <p class="settings-section-description">Set the orientation used for live streams and activity snapshots.</p>
          ${cameraOptionsTable(host)}
        </fieldset>

        <div class="settings-two-column">
        <fieldset class="settings-section door-events-section">
          <legend>${icons.door}<span>Door events</span></legend>
          <p class="settings-section-description">Automations and image delivery behavior.</p>
          ${eventOptions(host)}
        </fieldset>

        <fieldset class="settings-section storage-section">
          <legend>${icons.database}<span>Storage & Data Management</span></legend>
          <p class="settings-section-description">Keep a rolling buffer of activity history and preview images on this Home Assistant.</p>
          <div class="settings-row">
            <div><strong>Store activity history</strong><p>Keep a rolling buffer of activity records and preview images.</p></div>
            <label class="settings-switch" aria-label="Store activity history locally">
            <input name="store_activity_history" type="checkbox" ${settings.store_activity_history ? "checked" : ""}>
            <span></span>
            </label>
          </div>
          <div data-activity-storage-limit-controls ${settings.store_activity_history ? "" : "hidden"}>
            <div data-activity-storage-limit-warning>${activityStorageLimitWarning(settings)}</div>
            <label class="storage-limit-input"><span>Max cache limit</span>
              <input name="activity_history_max_storage_mb" type="number" min="0" value="${escapeHtml(storageLimitValue)}" style="--storage-limit-digits: ${Math.max(1, storageLimitValue.length)}" aria-label="Local activity storage limit in MB">
              <span class="activity-storage-limit-unit" data-activity-storage-limit-unit ${Number(storageLimitValue) >= 1 ? "" : "hidden"}>MB</span>
              <span class="activity-storage-limit-description" data-activity-storage-limit-description ${Number(settings.activity_history_max_storage_mb) > 0 ? "hidden" : ""}>Local activity storage limit in MB (0 = unlimited)</span>
            </label>
            <div class="storage-quota-card">
              <div class="storage-quota-heading"><span>Allocated quota</span><strong data-activity-storage-quota>${activityStorageQuota(settings)}</strong></div>
              <span data-activity-storage-progress>${activityStorageProgress(settings)}</span>
            </div>
            <div class="storage-actions"><button class="activity-storage-action activity-storage-clear" type="button" data-clear-activity-storage>${icons.trash}<span>Delete</span></button><span class="activity-storage-transfer-actions"><button class="activity-storage-action activity-storage-download" type="button" data-export-activity-storage>${icons.download}<span>Export</span></button><button class="activity-storage-action activity-storage-import" type="button" data-import-activity-storage>${icons.upload}<span>Import</span></button></span><input data-import-activity-file type="file" accept=".zip,application/zip" hidden></div>
          </div>
        </fieldset>
        </div>

        <fieldset class="settings-section">
          <legend>${icons.bug}<span>Debug</span></legend>
          <div class="settings-row">
            <div><strong>Enable debug logging</strong><p>Record detailed integration activity to help troubleshoot issues.</p></div>
            <label class="settings-switch" aria-label="Enable debug logging">
              <input name="debug_logging" type="checkbox" ${settings.debug_logging ? "checked" : ""}>
              <span></span>
            </label>
          </div>
          <div class="settings-row settings-link-row">
            <div><strong>View Home Assistant logs</strong><p>Open the log viewer with Akuvox already selected as the search term.</p></div>
            <a class="settings-native-link" href="/config/logs?search=Akuvox">Open logs${icons.externalLink}</a>
          </div>
        </fieldset>

        ${settings.credential_mode === "remote" ? `
        <fieldset class="settings-section remote-instances-section">
          <legend>${icons.hub}<span>Remote instance</span></legend>
          <p class="settings-section-description">This Home Assistant receives credentials from another instance.</p>
          ${remoteShareConnectionSection(settings.remote_last_sync)}
        </fieldset>` : `
        <fieldset class="settings-section remote-instances-section">
          <legend>${icons.hub}<span>Share Access & Multi-Instance Pairing</span></legend>
          <p class="settings-section-description">Securely bridge intercom events and temporary keys with other Home Assistant instances.</p>
          <button class="action settings-inline-action" type="button" data-create-credential-share>${icons.externalLink}<span>Create pairing link</span></button>
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
    const discardButton = settingsForm.querySelector("[data-discard-settings]");
    if (saveButton) saveButton.disabled = !host._settingsDirty || host._settingsSaving;
    if (discardButton) discardButton.disabled = !host._settingsDirty || host._settingsSaving;
  };
  settingsForm.addEventListener("input", markSettingsDirty);
  settingsForm.addEventListener("change", markSettingsDirty);
  settingsForm.querySelector("[data-discard-settings]")?.addEventListener("click", () => {
    if (!host._settingsDirty || host._settingsSaving) return;
    host._settingsDirty = false;
    host._requestLoad?.({ forceRender: true });
  });

  const storageHistoryToggle = settingsForm.querySelector(
    '[name="store_activity_history"]'
  );
  const storageLimitControls = settingsForm.querySelector(
    "[data-activity-storage-limit-controls]"
  );
  storageHistoryToggle?.addEventListener("change", () => {
    if (storageLimitControls) storageLimitControls.hidden = !storageHistoryToggle.checked;
  });
  const eventImageToggle = settingsForm.querySelector('[name="wait_for_event_image"]');
  const eventOverrideToggle = settingsForm.querySelector('[name="custom_event_image_wait"]');
  const eventOverrideControls = settingsForm.querySelector("[data-event-image-override-controls]");
  const eventOverrides = settingsForm.querySelector("[data-event-image-overrides]");
  const syncEventImageOptions = () => {
    const enabled = eventImageToggle?.checked ?? true;
    if (eventOverrideControls) eventOverrideControls.hidden = !enabled;
    if (eventOverrides) eventOverrides.hidden = !enabled || !eventOverrideToggle?.checked;
  };
  eventImageToggle?.addEventListener("change", syncEventImageOptions);
  eventOverrideToggle?.addEventListener("change", syncEventImageOptions);

  settingsForm.querySelector("[data-create-door-notification]")?.addEventListener("click", async () => {
    const selection = await requestDoorNotificationAutomation(host);
    if (!selection) return;
    const automationId = String(Date.now());
    try {
      await host._hass.callApi(
        "POST",
        `config/automation/config/${encodeURIComponent(automationId)}`,
        buildDoorNotificationAutomation(selection)
      );
      showDoorNotificationCreated(host, automationId);
    } catch (error) {
      showNotice(
        host,
        error?.message || "Could not create the notification automation.",
        "Automation creation failed"
      );
    }
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
    const quota = settingsForm.querySelector("[data-activity-storage-quota]");
    if (warning) warning.innerHTML = activityStorageLimitWarning(currentSettings);
    if (progress) progress.innerHTML = activityStorageProgress(currentSettings);
    if (quota) quota.textContent = activityStorageQuota(currentSettings);
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
        "This will prevent the remote Home Assistant instance from receiving new Akuvox credentials.",
        "Revoke paired Home Assistant?",
        "Revoke"
      );
      if (!confirmed) return;
      try {
        const response = await callWsWithBlocker(host, {
          type: "akuvox/panel_revoke_credential_share",
          entry_id: host._activeAccount,
          share_id: button.dataset.revokeCredentialShare,
        });
        if (response?.share?.revoked && host._settings?.credential_shares) {
          host._settings = {
            ...host._settings,
            credential_shares: host._settings.credential_shares.map((share) =>
              share.share_id === response.share.share_id ? response.share : share
            ),
          };
          host._render();
        } else {
          await host._load();
        }
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
