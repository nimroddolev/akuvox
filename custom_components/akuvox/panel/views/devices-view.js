/**
 * Devices view: Discovered cameras and door relays.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20261005-persistent-device-stills";
import { bindListOrdering, bindTileOrdering } from "../utils/tile-ordering.js?v=20260917-list-drop-position";
import { t } from "../utils/i18n.js?v=20261003-hebrew-rtl-2";

const unlockButton = (host, relays, relay) => {
  const label =
    relays.length > 1
      ? t(host, "Unlock {name}", { name: relay.source_door_name || relay.door_name || `Relay ${relay.relay_id}` })
      : t(host, "Unlock");
  return `<button class="action device-action device-unlock-action" data-relay="${escapeHtml(relay.relay_id)}" data-mac="${escapeHtml(relay.mac)}">${icons.unlock}<span>${escapeHtml(label)}</span></button>`;
};

/**
 * Render the HTML content for the Devices tab.
 * @param {HTMLElement} host
 * @param {object} account
 * @returns {string}
 */
export const renderDevicesView = (host, account) => {
  const devices = new Map();

  (account.cameras || []).forEach((camera) =>
    devices.set(camera.name, {
      name: camera.name,
      camera,
      relays: [],
      deviceId: camera.device_id,
    })
  );

  (account.relays || []).forEach((relay) => {
    const device = devices.get(relay.name) || {
      name: relay.name || relay.door_name,
      camera: null,
      relays: [],
      deviceId: relay.device_id,
    };
    if (!device.deviceId) device.deviceId = relay.device_id;
    device.relays.push(relay);
    devices.set(relay.name, device);
  });

  const deviceList = host._orderTiles(
    "devices",
    [...devices.values()],
    (device) => device.deviceId || device.name
  );
  const previewStatus = (camera) => {
    const key = camera?.source_name || camera?.name;
    const state = key && host._cameraPreviewStates?.get(key);
    if (state === "ready") return { className: "ready", label: t(host, "Camera connected") };
    if (state === "unavailable" || !camera?.preview_url) {
      return { className: "unavailable", label: t(host, "Camera disconnected") };
    }
    return { className: "loading", label: t(host, "Camera connecting…") };
  };
  const rows = deviceList
    .map((device) => {
      const status = previewStatus(device.camera);
      const cameraKey = device.camera?.source_name || device.camera?.name || "";
      return `
      <tr data-list-order-id="${escapeHtml(device.deviceId || device.name)}">
        <td>
          <div class="list-title"><button type="button" class="list-grab" data-list-grab aria-label="${escapeHtml(t(host, "Reorder {name}", { name: device.name }))}" title="${escapeHtml(t(host, "Drag to reorder"))}">⠿</button><strong>${escapeHtml(device.name)}</strong></div>
        </td>
        <td>
          <div class="actions">
            ${
              device.camera
                ? `<button class="action device-action device-monitor-action" data-stream="${escapeHtml(device.camera.source_name || device.camera.name)}" data-camera-entity="${escapeHtml(device.camera.entity_id || "")}" data-mode="open">${icons.webcam}<span>Monitor</span></button>`
                : '<span class="muted">No camera</span>'
            }
          </div>
        </td>
        <td>
          <div class="actions">
            ${
              device.relays
                .map((relay) => unlockButton(host, device.relays, relay))
                .join("") || '<span class="muted">No relay</span>'
            }
          </div>
        </td>
        <td>
          ${
            device.deviceId
              ? `<a class="info-link" href="/config/devices/device/${encodeURIComponent(device.deviceId)}">${icons.externalLink}<span>Device</span></a>`
              : '<span class="muted">Unavailable</span>'
          }
        </td>
      </tr>
    `
    })
    .join("");

  const tiles = deviceList
    .map((device) => {
      const status = previewStatus(device.camera);
      const cameraKey = device.camera?.source_name || device.camera?.name || "";
      return `
        <article class="tile-card device-tile" data-tile-order-id="${escapeHtml(device.deviceId || device.name)}">
          <div class="tile-card-heading">
            <div>
              <div class="tile-title"><button type="button" class="tile-grab" data-tile-grab aria-label="${escapeHtml(t(host, "Reorder {name}", { name: device.name }))}" title="${escapeHtml(t(host, "Drag to reorder"))}">⠿</button><h3>${escapeHtml(device.name)}</h3></div>
            </div>
            ${device.deviceId ? `<a class="info-link" href="/config/devices/device/${encodeURIComponent(device.deviceId)}">${icons.externalLink}Device</a>` : ""}
          </div>
          <div class="device-preview ${status.className}" ${device.camera ? `data-camera-preview-stream="${escapeHtml(device.camera.source_name || device.camera.name)}" data-camera-entity="${escapeHtml(device.camera.entity_id || "")}"` : ""} aria-label="${escapeHtml(device.camera ? t(host, "Camera preview from {name}", { name: device.name }) : t(host, "No camera preview available"))}">
            <span class="device-preview-placeholder" aria-hidden="true">${icons.webcam}</span>
            <p class="device-status ${status.className}" data-camera-status>${status.label}</p>
            ${device.camera?.preview_url ? `<img data-camera-key="${escapeHtml(cameraKey)}" src="${escapeHtml(device.camera.preview_url)}" alt="" loading="eager">` : ""}
            ${device.camera ? `<button type="button" class="device-preview-play device-monitor-action" data-stream="${escapeHtml(device.camera.source_name || device.camera.name)}" data-camera-entity="${escapeHtml(device.camera.entity_id || "")}" data-mode="open" aria-label="${escapeHtml(t(host, "Monitor {name}", { name: device.name }))}">${icons.play}</button>` : ""}
          </div>
          <div class="tile-actions">
            ${device.camera ? `<button class="action device-action device-monitor-action" data-stream="${escapeHtml(device.camera.source_name || device.camera.name)}" data-camera-entity="${escapeHtml(device.camera.entity_id || "")}" data-mode="open">${icons.webcam}<span>Monitor</span></button>` : '<span class="muted">No camera</span>'}
            ${device.relays.map((relay) => unlockButton(host, device.relays, relay)).join("") || '<span class="muted">No relay</span>'}
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="devices-view">
      <div class="section-heading row-view-heading">
        <div>
          <h2>Devices</h2>
          <p class="devices-summary">${t(host, deviceList.length === 1 ? "{count} device" : "{count} devices", { count: deviceList.length })}</p>
        </div>
        <div class="view-mode-toggle" role="group" aria-label="Device layout">
          <button type="button" class="action ${host._rowViewMode === "tiles" ? "active" : ""}" data-row-view-mode="tiles" aria-pressed="${host._rowViewMode === "tiles"}">${icons.grid}<span>Tiles</span></button>
          <button type="button" class="action ${host._rowViewMode === "tiles" ? "" : "active"}" data-row-view-mode="table" aria-pressed="${host._rowViewMode !== "tiles"}">${icons.table}<span>Table</span></button>
        </div>
      </div>
      ${host._rowViewMode === "tiles" ? `<div class="tile-grid device-tile-grid" data-tile-grid="devices">${tiles || '<p class="devices-empty">No devices discovered.</p>'}</div>` : `<div class="card table-wrap"><table class="device-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Camera</th>
            <th>Relays</th>
            <th>Info</th>
          </tr>
        </thead>
        <tbody data-list-order="devices">
          ${rows || '<tr><td colspan="4">No devices discovered.</td></tr>'}
        </tbody>
      </table></div>`}
    </section>
  `;
};

/**
 * Attach event listeners for the Devices tab.
 * @param {HTMLElement} host
 */
export const bindDevicesEvents = (host) => {
  bindTileOrdering(host, "devices");
  bindListOrdering(host, "devices");
  host._cameraPreviewStates ||= new Map();
  host.shadowRoot.querySelectorAll(".device-preview img").forEach((image) => {
    let loadTimer;
    const cameraKey = image.dataset.cameraKey;
    const setCameraStatus = (text, state) => {
      const status = image.closest(".device-tile")?.querySelector("[data-camera-status]");
      if (!status) return;
      status.textContent = text;
      status.classList.remove("loading", "ready", "unavailable");
      status.classList.add(state);
      image.parentElement?.classList.remove("loading", "ready", "unavailable");
      image.parentElement?.classList.add(state);
    };
    const markPreviewLoaded = () => {
      window.clearTimeout(loadTimer);
      host._cameraPreviewStates.set(cameraKey, "ready");
      image.parentElement?.classList.add("loaded");
      setCameraStatus(t(host, "Camera connected"), "ready");
    };
    image.addEventListener("load", markPreviewLoaded);
    image.addEventListener("error", () => {
      window.clearTimeout(loadTimer);
      host._cameraPreviewStates.set(cameraKey, "unavailable");
      image.parentElement?.classList.remove("loaded");
      image.remove();
      setCameraStatus(t(host, "Camera unavailable"), "unavailable");
    });
    // Cached camera stills can finish before this binding runs.
    if (image.complete && image.naturalWidth > 0) markPreviewLoaded();
    else {
      loadTimer = window.setTimeout(() => {
        if (!image.complete || image.naturalWidth === 0) {
          host._cameraPreviewStates.set(cameraKey, "unavailable");
          setCameraStatus(t(host, "Camera disconnected"), "unavailable");
        }
      }, 8000);
    }
  });
  host.shadowRoot.querySelectorAll("[data-stream]").forEach((button) =>
    button.addEventListener("click", () =>
      host._stream(button.dataset.stream, button.dataset.mode, button.dataset.cameraEntity)
    )
  );

  host.shadowRoot.querySelectorAll("[data-camera-preview-stream]").forEach((preview) =>
    preview.addEventListener("click", (event) => {
      // The play button has its own handler. Let it handle the click once.
      if (event.target.closest("button, a")) return;
      host._stream(preview.dataset.cameraPreviewStream, "open", preview.dataset.cameraEntity)
    })
  );

  host.shadowRoot.querySelectorAll("[data-relay]").forEach((button) =>
    button.addEventListener("click", () =>
      host._relay(button.dataset.mac, button.dataset.relay)
    )
  );

};
