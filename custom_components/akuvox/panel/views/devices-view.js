/**
 * Devices view: Discovered cameras and door relays.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260830-device-action-gradients";

/**
 * Render the HTML content for the Devices tab.
 * @param {object} account
 * @returns {string}
 */
export const renderDevicesView = (account) => {
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

  const rows = [...devices.values()]
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

  return `
    <div class="card table-wrap">
      <h2>Devices</h2>
      <table class="device-table">
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
      </table>
    </div>
  `;
};

/**
 * Attach event listeners for the Devices tab.
 * @param {HTMLElement} host
 */
export const bindDevicesEvents = (host) => {
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
