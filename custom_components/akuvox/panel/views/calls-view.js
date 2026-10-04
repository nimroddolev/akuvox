/**
 * Calls view: SmartPlus intercom and doorbell call logs.
 */

import { escapeHtml } from "../utils/dom.js";
import {
  bindMultiSelectFilters,
  matchesSelectedFilter,
  renderMultiSelectFilter,
} from "../utils/multi-select-filter.js?v=20260925-option-labels";
import { tableTimestampFormatter } from "../utils/formatters.js?v=20260820-table-timestamps";
import { showCallImageDialog } from "../components/image-dialog.js";
import { t } from "../utils/i18n.js?v=20261003-hebrew-rtl-6";

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

const visibleCallKey = (call) =>
  call.startTime
    ? JSON.stringify([
        call.startTime,
        call.callerName || "",
        call.calleeName || "",
        Boolean(call.isAnswer),
        call.callDuration || "",
      ])
    : "id:" + (call.id || "");

const parseCallTimestamp = (value) => {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
};

const formatCallAge = (host, value) => {
  const timestamp = parseCallTimestamp(value);
  if (!timestamp) return "";
  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const isToday = timestamp.toDateString() === now.toDateString();
  const withToday = (label) => (isToday ? `${t(host, "Today")} • ${label}` : label);
  if (elapsedMinutes < 1) return withToday(t(host, "Just now"));
  if (elapsedMinutes < 60) return withToday(t(host, elapsedMinutes === 1 ? "{count} min ago" : "{count} mins ago", { count: elapsedMinutes }));
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return withToday(t(host, elapsedHours === 1 ? "{count} hour ago" : "{count} hours ago", { count: elapsedHours }));
  const elapsedDays = Math.floor(elapsedHours / 24);
  return t(host, elapsedDays === 1 ? "{count} day ago" : "{count} days ago", { count: elapsedDays });
};

const renderCallTimestamp = (host, value, formatTimestamp) => {
  const age = formatCallAge(host, value);
  return `<div class="activity-timestamp">
    <time>${escapeHtml(formatTimestamp(value))}</time>
    ${age ? `<span>${escapeHtml(age)}</span>` : ""}
  </div>`;
};

/**
 * Render HTML content for the Call history tab.
 * @param {HTMLElement} host
 * @param {object} account
 * @returns {string}
 */
export const renderCallsView = (host, account) => {
  const calls = (account.calls || []).filter((call, index, all) =>
    all.findIndex((candidate) => visibleCallKey(candidate) === visibleCallKey(call)) === index
  );
  const sortOptions = [
    { value: "startTime", label: "Time" },
    { value: "callerName", label: "Caller" },
    { value: "calleeName", label: "Callee" },
    { value: "status", label: "Status" },
    { value: "callDuration", label: "Duration" },
    { value: "image", label: "Image" },
  ];
  const activeSortLabel =
    sortOptions.find((option) => option.value === host._callSort.key)?.label || "Time";
  const filterCount = Object.values(host._callFilters).reduce(
    (count, values) => count + values.length,
    0
  );

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
      <div class="mobile-filter-toolbar">
        <button type="button" class="mobile-filter-toggle" data-mobile-filter-toggle="calls" aria-expanded="${Boolean(host._mobileFiltersOpen.calls)}">Filter${filterCount ? ` <span class="mobile-filter-count">${filterCount}</span>` : ""}</button>
      </div>
      <div class="activity-controls mobile-filter-panel ${host._mobileFiltersOpen.calls ? "mobile-filter-panel-open" : ""}">
        ${renderMultiSelectFilter({ scope: "call", key: "callerName", label: "Caller", allLabel: "All Callers", values: callFilterValues(calls, "callerName"), selected: host._callFilters.callerName, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "call", key: "calleeName", label: "Callee", allLabel: "All Callees", values: callFilterValues(calls, "calleeName"), selected: host._callFilters.calleeName, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "call", key: "status", label: "Status", allLabel: "All Statuses", values: callFilterValues(calls, "status"), selected: host._callFilters.status, openMenu: host._openFilterMenu })}
        <div class="tile-sort-control">
          <details class="multi-select-filter" data-filter-menu="call-sort" ${host._openFilterMenu === "call-sort" ? "open" : ""}>
            <summary><span>Sort By</span><span class="multi-select-filter-summary">${escapeHtml(activeSortLabel)}</span></summary>
            <div class="multi-select-filter-options" role="radiogroup" aria-label="Sort call history by">
              ${sortOptions.map((option) => `<label><input type="radio" name="call-sort" data-call-sort-menu value="${option.value}" ${host._callSort.key === option.value ? "checked" : ""}> ${option.label}</label>`).join("")}
            </div>
          </details>
          <button type="button" class="tile-sort-direction" data-call-sort-direction aria-label="${escapeHtml(t(host, "Sort {direction}", { direction: t(host, host._callSort.direction === "asc" ? "ascending" : "descending") }))}" title="${escapeHtml(t(host, "Sort {direction}", { direction: t(host, host._callSort.direction === "asc" ? "ascending" : "descending") }))}">${host._callSort.direction === "asc" ? "↑" : "↓"}</button>
        </div>
        <button type="button" class="mobile-clear-filters" data-clear-mobile-filters>Clear filters</button>
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
                <td>${renderCallTimestamp(host, call.startTime, formatTimestamp)}</td>
                <td>${escapeHtml(call.callerName || "")}</td>
                <td>${escapeHtml(call.calleeName || "")}</td>
                <td>
                  <span class="call-status ${call.isAnswer ? "answered" : "missed"}">
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
    .querySelector("[data-mobile-filter-toggle]")
    ?.addEventListener("click", () => {
      host._mobileFiltersOpen.calls = !host._mobileFiltersOpen.calls;
      host._render();
    });

  host.shadowRoot
    .querySelector("[data-clear-mobile-filters]")
    ?.addEventListener("click", () => {
      host._callFilters = { callerName: [], calleeName: [], status: [] };
      host._openFilterMenu = "";
      host._render();
    });

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
    .querySelectorAll("[data-call-sort-menu]")
    .forEach((input) =>
      input.addEventListener("change", (event) => {
        if (!event.target.checked) return;
        host._callSort = {
          key: event.target.value,
          direction: event.target.value === "startTime" ? "desc" : "asc",
        };
        host._openFilterMenu = "";
        host._render();
      })
    );

  host.shadowRoot
    .querySelector("[data-call-sort-direction]")
    ?.addEventListener("click", () => {
      host._callSort = {
        ...host._callSort,
        direction: host._callSort.direction === "asc" ? "desc" : "asc",
      };
      host._render();
    });

  host.shadowRoot
    .querySelectorAll("[data-call-image]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showCallImageDialog(host, button.dataset.callImage)
      )
    );
};
