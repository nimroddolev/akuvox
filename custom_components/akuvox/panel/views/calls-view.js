/**
 * Calls view: SmartPlus intercom and doorbell call logs.
 */

import { escapeHtml } from "../utils/dom.js";
import {
  bindMultiSelectFilters,
  matchesSelectedFilter,
  renderMultiSelectFilter,
} from "../utils/multi-select-filter.js?v=20260827-multi-table-filters";
import { tableTimestampFormatter } from "../utils/formatters.js?v=20260820-table-timestamps";
import { showCallImageDialog } from "../components/image-dialog.js";

const callFilterValues = (calls, key) => [
    ...new Set(
      calls
        .map((call) =>
          key === "status"
            ? call.isAnswer
              ? "Answered"
              : "Missed"
            : String(call[key] || "")
        )
        .filter(Boolean)
    ),
  ].sort();

/**
 * Render HTML content for the Call history tab.
 * @param {HTMLElement} host
 * @param {object} account
 * @returns {string}
 */
export const renderCallsView = (host, account) => {
  const calls = account.calls || [];

  const filtered = calls
    .filter(
      (call) =>
        matchesSelectedFilter(host._callFilters.callerName, call.callerName) &&
        matchesSelectedFilter(host._callFilters.calleeName, call.calleeName) &&
        matchesSelectedFilter(host._callFilters.status, call.isAnswer ? "Answered" : "Missed")
    )
    .sort((a, b) => {
      const getValue = (call) =>
        host._callSort.key === "status"
          ? call.isAnswer
            ? "Answered"
            : "Missed"
          : host._callSort.key === "image"
            ? String(Boolean(call.has_image))
            : String(call[host._callSort.key] || "");
      return (
        getValue(a).localeCompare(getValue(b)) *
        (host._callSort.direction === "asc" ? 1 : -1)
      );
    });

  const heading = (label, key) =>
    `<button class="sort-button ${host._callSort.key === key ? "active" : ""}" data-call-sort="${key}" data-direction="${host._callSort.direction === "asc" ? "↑" : "↓"}">${label}</button>`;
  const formatTimestamp = tableTimestampFormatter(filtered.map((call) => call.startTime));

  return `
    <div class="card table-wrap">
      <h2>Call history</h2>
      <p class="muted">The latest SmartPlus call history is refreshed alongside activity polling and retained across restarts.</p>
      <div class="activity-controls">
        ${renderMultiSelectFilter({ scope: "call", key: "callerName", label: "Caller", allLabel: "All callers", values: callFilterValues(calls, "callerName"), selected: host._callFilters.callerName, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "call", key: "calleeName", label: "Callee", allLabel: "All callees", values: callFilterValues(calls, "calleeName"), selected: host._callFilters.calleeName, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "call", key: "status", label: "Status", allLabel: "All statuses", values: callFilterValues(calls, "status"), selected: host._callFilters.status, openMenu: host._openFilterMenu })}
      </div>
      <table>
        <thead>
          <tr>
            <th>${heading("Time", "startTime")}</th>
            <th>${heading("Caller", "callerName")}</th>
            <th>${heading("Callee", "calleeName")}</th>
            <th>${heading("Status", "status")}</th>
            <th>${heading("Duration", "callDuration")}</th>
            <th>${heading("Image", "image")}</th>
          </tr>
        </thead>
        <tbody>
          ${
            filtered
              .map(
                (call) => `
              <tr>
                <td>${escapeHtml(formatTimestamp(call.startTime))}</td>
                <td>${escapeHtml(call.callerName || "")}</td>
                <td>${escapeHtml(call.calleeName || "")}</td>
                <td>
                  <span style="color:${call.isAnswer ? "#16a34a" : "#dc2626"};font-weight:700">
                    ${call.isAnswer ? "Answered" : "Missed"}
                  </span>
                </td>
                <td>${escapeHtml(call.isAnswer ? call.callDuration || "-" : "-")}</td>
                <td>
                  ${
                    call.has_image
                      ? `<button class="action activity-image-button" data-call-image="${escapeHtml(call.id)}">View</button>`
                      : '<span class="muted">Unavailable</span>'
                  }
                </td>
              </tr>
            `
              )
              .join("") || '<tr><td colspan="6">No matching calls.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
};

/**
 * Attach event listeners for the Call history tab.
 * @param {HTMLElement} host
 */
export const bindCallsEvents = (host) => {
  bindMultiSelectFilters(host, "call", host._callFilters, () => host._render());

  host.shadowRoot
    .querySelectorAll("[data-call-sort]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const key = button.dataset.callSort;
        host._callSort = {
          key,
          direction:
            host._callSort.key === key && host._callSort.direction === "asc"
              ? "desc"
              : "asc",
        };
        host._render();
      })
    );

  host.shadowRoot
    .querySelectorAll("[data-call-image]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showCallImageDialog(host, button.dataset.callImage)
      )
    );
};
