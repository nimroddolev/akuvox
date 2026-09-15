/**
 * Devices view: Discovered cameras and door relays.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260830-device-action-gradients";
import { bindTileOrdering } from "../utils/tile-ordering.js?v=20260909-deferred-cancel";

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

  const deviceList =
    host._rowViewMode === "tiles"
      ? host._orderTiles("devices", [...devices.values()], (device) => device.deviceId || device.name)
      : [...devices.values()];
  const rows = deviceList
    .map(
      (device) => `
      <tr>
        <td>
          <strong>${escapeHtml(device.name)}</strong>
          ${
            device.relays.length
              ? `<br><small class="muted">${escapeHtml(
                  device.relays
                    .map((relay) => `${relay.door_name} (relay ${relay.relay_id})`)
                    .join(", ")
                )}</small>`
              : ""
          }
        </td>
        <td>
          <div class="actions">
            ${
              device.camera
                ? `<button class="action device-action device-monitor-action" data-stream="${escapeHtml(device.camera.name)}" data-mode="open">${icons.webcam}<span>Monitor</span></button>`
                : '<span class="muted">No camera</span>'
            }
          </div>
        </td>
        <td>
          <div class="actions">
            ${
              device.relays
                .map(
                  (relay) =>
                    `<button class="action device-action device-unlock-action" data-relay="${escapeHtml(relay.relay_id)}" data-mac="${escapeHtml(relay.mac)}">${icons.doorOpen}<span>Unlock</span></button>`
                )
                .join("") || '<span class="muted">No relay</span>'
            }
          </div>
        </td>
        <td>
          ${
            device.deviceId
              ? `<a class="info-link" href="/config/devices/device/${encodeURIComponent(device.deviceId)}">${icons.externalLink}Device</a>`
              : '<span class="muted">Unavailable</span>'
          }
        </td>
      </tr>
    `
    )
    .join("");

  const tiles = deviceList
    .map(
      (device) => `
        <article class="tile-card device-tile" data-tile-order-id="${escapeHtml(device.deviceId || device.name)}">
          <div class="tile-card-heading">
            <div>
              <div class="tile-title"><button type="button" class="tile-grab" data-tile-grab aria-label="Reorder ${escapeHtml(device.name)}" title="Drag to reorder">⠿</button><h3>${escapeHtml(device.name)}</h3></div>
            </div>
            ${device.deviceId ? `<a class="info-link" href="/config/devices/device/${encodeURIComponent(device.deviceId)}">${icons.externalLink}Device</a>` : ""}
          </div>
          <div class="tile-actions">
            ${device.camera ? `<button class="action device-action device-monitor-action" data-stream="${escapeHtml(device.camera.name)}" data-mode="open">${icons.webcam}<span>Monitor</span></button>` : '<span class="muted">No camera</span>'}
            ${device.relays.map((relay) => `<button class="action device-action device-unlock-action" data-relay="${escapeHtml(relay.relay_id)}" data-mac="${escapeHtml(relay.mac)}">${icons.doorOpen}<span>Unlock ${escapeHtml(relay.door_name)}</span></button>`).join("") || '<span class="muted">No relay</span>'}
          </div>
        </article>
      `
    )
    .join("");

  return `
    <div class="card table-wrap">
      <div class="section-heading row-view-heading">
        <h2>Devices</h2>
        <div class="view-mode-toggle" role="group" aria-label="Device layout">
          <button type="button" class="action ${host._rowViewMode === "tiles" ? "" : "active"}" data-row-view-mode="table" aria-pressed="${host._rowViewMode !== "tiles"}">Table</button>
          <button type="button" class="action ${host._rowViewMode === "tiles" ? "active" : ""}" data-row-view-mode="tiles" aria-pressed="${host._rowViewMode === "tiles"}">Tiles</button>
        </div>
      </div>
      ${host._rowViewMode === "tiles" ? `<div class="tile-grid device-tile-grid" data-tile-grid="devices">${tiles || '<p>No devices discovered.</p>'}</div>` : `<table class="device-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Camera</th>
            <th>Relays</th>
            <th>Info</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4">No devices discovered.</td></tr>'}
        </tbody>
      </table>`}
    </div>
  `;
};

/**
 * Attach event listeners for the Devices tab.
 * @param {HTMLElement} host
 */
export const bindDevicesEvents = (host) => {
  bindTileOrdering(host, "devices");
  host.shadowRoot.querySelectorAll("[data-stream]").forEach((button) =>
    button.addEventListener("click", () =>
      host._stream(button.dataset.stream, button.dataset.mode)
    )
  );

  host.shadowRoot.querySelectorAll("[data-relay]").forEach((button) =>
    button.addEventListener("click", () =>
      host._relay(button.dataset.mac, button.dataset.relay)
    )
  );
};
