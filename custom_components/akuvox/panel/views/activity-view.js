/**
 * Activity view: SmartPlus door access events and image snapshots.
 */

import { escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js";
import { showActivityImageDialog } from "../components/image-dialog.js?v=20260820-camera-orientation";

const activityOrientation = (host, item) => {
  const settings = host._settings || {};
  if (!settings.custom_activity_image_orientations) return "none";
  return settings.activity_image_orientations?.[String(item.Location || "").trim()] || "none";
};

/**
 * Build option elements for filter dropdowns.
 * @param {Array<object>} items
 * @param {string} key
 * @param {string} selectedValue
 * @returns {string}
 */
const buildFilterOptions = (items, key, selectedValue) => {
  const uniqueValues = [
    ...new Set(items.map((item) => String(item[key] || "")).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  return uniqueValues
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${selectedValue === value ? "selected" : ""}>${escapeHtml(value)}</option>`
    )
    .join("");
};

/**
 * Render the activity thumbnail preview or placeholder.
 * @param {HTMLElement} host
 * @param {object} item
 * @returns {string}
 */
const renderThumbnail = (host, item) => {
  if (!item.has_image) return '<span class="muted">Unavailable</span>';

  const imageKey = host._activityImageKey(item.CaptureTime);
  if (host._activityImageFailures.has(imageKey)) {
    return '<span class="activity-thumbnail-error">Error</span>';
  }

  const image = host._activityImages.get(imageKey);
  const ready = image && typeof image.then !== "function";
  if (!ready) {
    return `
      <span class="activity-thumbnail loading" role="status" aria-label="Loading activity image">
        <span class="thumbnail-spinner" aria-hidden="true"></span>
      </span>
    `;
  }

  return `
    <button class="activity-thumbnail" aria-label="View activity image" data-activity-image="${escapeHtml(item.CaptureTime)}">
      <img alt="" data-orientation="${activityOrientation(host, item)}" src="data:${image.content_type};base64,${image.data}">
      ${icons.searchThumbnail}
    </button>
  `;
};

/**
 * Render HTML content for the Latest Activity tab.
 * @param {HTMLElement} host
 * @param {object} account
 * @returns {string}
 */
export const renderActivityView = (host, account) => {
  const activity = account.activity || [];

  const filtered = activity
    .filter((item) =>
      Object.entries(host._activityFilters).every(
        ([key, value]) => !value || String(item[key] || "") === value
      )
    )
    .sort(
      (a, b) =>
        String(a[host._activitySort.key] || "").localeCompare(
          String(b[host._activitySort.key] || "")
        ) * (host._activitySort.direction === "asc" ? 1 : -1)
    );

  const heading = (label, key) =>
    `<button class="sort-button ${host._activitySort.key === key ? "active" : ""}" data-activity-sort="${key}" data-direction="${host._activitySort.direction === "asc" ? "↑" : "↓"}">${label}</button>`;

  return `
    <div class="card table-wrap">
      <h2>Latest activity</h2>
      <p class="muted">Recent SmartPlus activity is retained across Home Assistant restarts and refreshed by polling.</p>
      <div class="activity-controls">
        <label>
          Door
          <select data-activity-filter="Location">
            <option value="">All doors</option>
            ${buildFilterOptions(activity, "Location", host._activityFilters.Location)}
          </select>
        </label>
        <label>
          Event
          <select data-activity-filter="CaptureType">
            <option value="">All events</option>
            ${buildFilterOptions(activity, "CaptureType", host._activityFilters.CaptureType)}
          </select>
        </label>
        <label>
          Initiator
          <select data-activity-filter="Initiator">
            <option value="">All initiators</option>
            ${buildFilterOptions(activity, "Initiator", host._activityFilters.Initiator)}
          </select>
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>${heading("Time", "CaptureTime")}</th>
            <th>${heading("Door", "Location")}</th>
            <th>${heading("Event", "CaptureType")}</th>
            <th>${heading("Initiator", "Initiator")}</th>
            <th>Image</th>
          </tr>
        </thead>
        <tbody>
          ${
            filtered
              .map(
                (item) => `
              <tr>
                <td>${escapeHtml(item.CaptureTime || "")}</td>
                <td>${escapeHtml(item.Location || "")}</td>
                <td>${escapeHtml(item.CaptureType || "")}</td>
                <td>${escapeHtml(item.Initiator || "")}</td>
                <td class="activity-image-cell">${renderThumbnail(host, item)}</td>
              </tr>
            `
              )
              .join("") || '<tr><td colspan="5">No matching activity.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
};

/**
 * Attach event listeners for the Activity tab.
 * @param {HTMLElement} host
 */
export const bindActivityEvents = (host) => {
  host.shadowRoot
    .querySelectorAll("[data-activity-image]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const matchesFilters = (item) =>
          Object.entries(host._activityFilters).every(
            ([key, value]) => !value || String(item[key] || "") === value
          );
        const events = (host._account()?.activity || [])
          .filter((item) => item.has_image && matchesFilters(item))
          .sort(
            (left, right) =>
              String(left[host._activitySort.key] || "").localeCompare(
                String(right[host._activitySort.key] || "")
              ) * (host._activitySort.direction === "asc" ? 1 : -1)
          );

        showActivityImageDialog(
          host,
          button.dataset.activityImage,
          events,
          (captureTime) => host._getActivityImage(captureTime)
          , (item) => activityOrientation(host, item)
        );
      })
    );

  host.shadowRoot
    .querySelectorAll("[data-activity-filter]")
    .forEach((select) =>
      select.addEventListener("change", () => {
        host._activityFilters[select.dataset.activityFilter] = select.value;
        host._render();
      })
    );

  host.shadowRoot
    .querySelectorAll("[data-activity-sort]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const key = button.dataset.activitySort;
        host._activitySort = {
          key,
          direction:
            host._activitySort.key === key &&
            host._activitySort.direction === "asc"
              ? "desc"
              : "asc",
        };
        host._render();
      })
    );
};
