/**
 * Activity view: SmartPlus door access events and image snapshots.
 */

import { escapeHtml } from "../utils/dom.js";
import {
  bindMultiSelectFilters,
  matchesSelectedFilter,
  renderMultiSelectFilter,
} from "../utils/multi-select-filter.js?v=20260925-option-labels";
import { tableTimestampFormatter } from "../utils/formatters.js?v=20260820-table-timestamps";
import { icons } from "../utils/icons.js";
import { showActivityImageDialog } from "../components/image-dialog.js?v=20260909-instant-open";
import {
  ACTIVITY_INITIAL_PAGE_SIZE,
  nextActivityVisibleCount,
  visibleActivityItems,
} from "../utils/activity-pagination.mjs";

const activityOrientation = (host, item) => {
  const settings = host._settings || {};
  if (!settings.custom_activity_image_orientations) return "none";
  return settings.activity_image_orientations?.[
    String(item.source_location || item.Location || "").trim()
  ] || "none";
};

const formatStorageAmount = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number(bytes) || 0);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
};

/** Convert a SmartPlus camelCase or PascalCase event type into title-cased words. */
export const formatActivityEventType = (value) => String(value || "")
  .replace(/([A-Z])/g, " $1")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(" ");

const activityStorageWarning = (settings) => {
  const limitBytes = (Number(settings?.activity_history_max_storage_mb) || 0) * 1_000_000;
  const usageBytes = Math.max(0, Number(settings?.activity_history_storage_bytes) || 0);
  if (!limitBytes || usageBytes < limitBytes * 0.9) return "";
  const percentage = Math.min(100, (usageBytes / limitBytes) * 100);
  const full = usageBytes >= limitBytes;
  return `<div class="activity-storage-warning" role="alert">
    <strong>${full ? "Local activity storage is full." : "Local activity storage is almost full."}</strong>
    ${escapeHtml(`${formatStorageAmount(usageBytes)} used (${percentage.toFixed(percentage >= 10 ? 0 : 1)}%).`)}
    ${full ? " The oldest stored activity will be deleted to make room for new activity." : " Increase the storage limit or clear downloaded activity data if needed."}
  </div>`;
};

const filterValues = (items, key) => [
    ...new Set(items.map((item) => String(item[key] || "")).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

const formatUpdatedAgo = (timestamp) => {
  const updatedAt = Date.parse(timestamp || "");
  if (Number.isNaN(updatedAt)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  const [amount, unit] =
    seconds < 60
      ? [seconds, "s"]
      : seconds < 3600
        ? [Math.floor(seconds / 60), "m"]
        : seconds < 86400
          ? [Math.floor(seconds / 3600), "h"]
          : [Math.floor(seconds / 86400), "d"];
  const indicator = seconds <= 5 ? "🟢" : seconds >= 30 ? "🔴" : "🟡";
  return `${indicator} Updated ${amount}${unit} ago`;
};

const updateActivityUpdatedLabel = (host) => {
  const label = host.shadowRoot.querySelector("[data-activity-updated-at]");
  if (label) label.textContent = formatUpdatedAgo(label.dataset.activityUpdatedAt);
};

const parseActivityTimestamp = (value) => {
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

const formatActivityAge = (value) => {
  const timestamp = parseActivityTimestamp(value);
  if (!timestamp) return "";
  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const isToday = timestamp.toDateString() === now.toDateString();
  const dayLabel = isToday ? "Today" : "";
  const withDayLabel = (age) => (dayLabel ? `${dayLabel} • ${age}` : age);
  if (elapsedMinutes < 1) return withDayLabel("Just now");
  if (elapsedMinutes < 60) {
    return withDayLabel(`${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`);
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return withDayLabel(`${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`);
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
};

const renderActivityTimestamp = (value, formatTimestamp) => {
  const age = formatActivityAge(value);
  return `<div class="activity-timestamp">
    <time>${escapeHtml(formatTimestamp(value))}</time>
    ${age ? `<span>${escapeHtml(age)}</span>` : ""}
  </div>`;
};

/** Return the events currently represented by rows in the activity table. */
export const visibleActivityEvents = (host, activity) => {
  const filtered = activity
    .filter((item) =>
      Object.entries(host._activityFilters).every(
        ([key, values]) => matchesSelectedFilter(values, item[key])
      )
    )
    .sort(
      (a, b) =>
        String(a[host._activitySort.key] || "").localeCompare(
          String(b[host._activitySort.key] || "")
        ) * (host._activitySort.direction === "asc" ? 1 : -1)
    );

  return {
    filtered,
    visible: visibleActivityItems(filtered, host._activityVisibleCount),
  };
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
  const { filtered, visible } = visibleActivityEvents(host, activity);
  const sortOptions = [
    { value: "CaptureTime", label: "Time" },
    { value: "Location", label: "Door" },
    { value: "CaptureType", label: "Event" },
    { value: "Initiator", label: "Initiator" },
  ];
  const activeSortLabel =
    sortOptions.find((option) => option.value === host._activitySort.key)?.label || "Time";
  const filterCount = Object.values(host._activityFilters).reduce(
    (count, values) => count + values.length,
    0
  );

  const heading = (label, key) =>
    `<button class="sort-button ${host._activitySort.key === key ? "active" : ""}" data-activity-sort="${key}" data-direction="${host._activitySort.direction === "asc" ? "↑" : "↓"}">${label}</button>`;

  const formatTimestamp = tableTimestampFormatter(filtered.map((item) => item.CaptureTime));
  const hasMore = visible.length < filtered.length;

  return `
    <div class="card table-wrap activity-table-wrap">
      <div class="section-heading activity-heading">
        <h2>Latest activity</h2>
        ${account.activity_updated_at ? `<span class="muted activity-updated" data-activity-updated-at="${escapeHtml(account.activity_updated_at)}"></span>` : ""}
      </div>
      ${activityStorageWarning(host._settings)}
      <p class="muted">Recent SmartPlus activity is retained across Home Assistant restarts and refreshed by polling.</p>
      <div class="mobile-filter-toolbar">
        <button type="button" class="mobile-filter-toggle" data-mobile-filter-toggle="activity" aria-expanded="${Boolean(host._mobileFiltersOpen.activity)}">Filter${filterCount ? ` <span class="mobile-filter-count">${filterCount}</span>` : ""}</button>
      </div>
      <div class="activity-controls mobile-filter-panel ${host._mobileFiltersOpen.activity ? "mobile-filter-panel-open" : ""}">
        ${renderMultiSelectFilter({ scope: "activity", key: "Location", label: "Door", allLabel: "All Doors", values: filterValues(activity, "Location"), selected: host._activityFilters.Location, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "activity", key: "CaptureType", label: "Event", allLabel: "All Events", values: filterValues(activity, "CaptureType"), selected: host._activityFilters.CaptureType, openMenu: host._openFilterMenu })}
        ${renderMultiSelectFilter({ scope: "activity", key: "Initiator", label: "Initiator", allLabel: "All Initiators", values: filterValues(activity, "Initiator"), selected: host._activityFilters.Initiator, openMenu: host._openFilterMenu })}
        <div class="tile-sort-control">
          <details class="multi-select-filter" data-filter-menu="activity-sort" ${host._openFilterMenu === "activity-sort" ? "open" : ""}>
            <summary><span>Sort By</span><span class="multi-select-filter-summary">${escapeHtml(activeSortLabel)}</span></summary>
            <div class="multi-select-filter-options" role="radiogroup" aria-label="Sort latest activity by">
              ${sortOptions.map((option) => `<label><input type="radio" name="activity-sort" data-activity-sort-menu value="${option.value}" ${host._activitySort.key === option.value ? "checked" : ""}> ${option.label}</label>`).join("")}
            </div>
          </details>
          <button type="button" class="tile-sort-direction" data-activity-sort-direction aria-label="Sort ${host._activitySort.direction === "asc" ? "ascending" : "descending"}" title="Sort ${host._activitySort.direction === "asc" ? "ascending" : "descending"}">${host._activitySort.direction === "asc" ? "↑" : "↓"}</button>
        </div>
        <button type="button" class="mobile-clear-filters" data-clear-mobile-filters>Clear filters</button>
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
            visible
              .map(
                (item) => `
              <tr>
                <td>${renderActivityTimestamp(item.CaptureTime, formatTimestamp)}</td>
                <td>${escapeHtml(item.Location || "")}</td>
                <td>${escapeHtml(formatActivityEventType(item.CaptureType))}</td>
                <td>${escapeHtml(item.Initiator || "")}</td>
                <td class="activity-image-cell">${renderThumbnail(host, item)}</td>
              </tr>
            `
              )
              .join("") || '<tr><td colspan="5">No matching activity.</td></tr>'
          }
        </tbody>
      </table>
      ${
        hasMore
          ? `<div class="activity-load-more" data-activity-load-more aria-live="polite">Scroll to load more activity</div>`
          : ""
      }
    </div>
  `;
};

/**
 * Attach event listeners for the Activity tab.
 * @param {HTMLElement} host
 */
export const bindActivityEvents = (host) => {
  host._activityPaginationObserver?.disconnect();
  window.clearInterval(host._activityUpdatedTimer);
  updateActivityUpdatedLabel(host);
  if (host.shadowRoot.querySelector("[data-activity-updated-at]")) {
    host._activityUpdatedTimer = window.setInterval(
      () => updateActivityUpdatedLabel(host),
      1000
    );
  }
  host.shadowRoot
    .querySelectorAll("[data-activity-image]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        void showActivityImageDialog(
          host,
          button.dataset.activityImage,
          () => visibleActivityEvents(host, host._account()?.activity || []).filtered
            .filter((item) => item.has_image),
          (captureTime) => host._getActivityImage(captureTime),
          (item) => activityOrientation(host, item)
        );
      })
    );

  bindMultiSelectFilters(host, "activity", host._activityFilters, () => {
    host._activityVisibleCount = ACTIVITY_INITIAL_PAGE_SIZE;
    host._render();
  });

  host.shadowRoot
    .querySelector("[data-mobile-filter-toggle]")
    ?.addEventListener("click", () => {
      host._mobileFiltersOpen.activity = !host._mobileFiltersOpen.activity;
      host._render();
    });

  host.shadowRoot
    .querySelector("[data-clear-mobile-filters]")
    ?.addEventListener("click", () => {
      host._activityFilters = { Location: [], CaptureType: [], Initiator: [] };
      host._activityVisibleCount = ACTIVITY_INITIAL_PAGE_SIZE;
      host._openFilterMenu = "";
      host._render();
    });

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
        host._activityVisibleCount = ACTIVITY_INITIAL_PAGE_SIZE;
        host._render();
      })
    );

  host.shadowRoot
    .querySelectorAll("[data-activity-sort-menu]")
    .forEach((input) =>
      input.addEventListener("change", (event) => {
        if (!event.target.checked) return;
        host._activitySort = {
          key: event.target.value,
          direction: event.target.value === "CaptureTime" ? "desc" : "asc",
        };
        host._activityVisibleCount = ACTIVITY_INITIAL_PAGE_SIZE;
        host._openFilterMenu = "";
        host._render();
      })
    );

  host.shadowRoot
    .querySelector("[data-activity-sort-direction]")
    ?.addEventListener("click", () => {
      host._activitySort = {
        ...host._activitySort,
        direction: host._activitySort.direction === "asc" ? "desc" : "asc",
      };
      host._activityVisibleCount = ACTIVITY_INITIAL_PAGE_SIZE;
      host._render();
    });

  const loadMore = host.shadowRoot.querySelector("[data-activity-load-more]");
  if (loadMore && typeof IntersectionObserver !== "undefined") {
    host._activityPaginationObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        host._activityPaginationObserver?.disconnect();
        host._activityVisibleCount = nextActivityVisibleCount(host._activityVisibleCount);
        host._render();
      },
      { rootMargin: "0px 0px 120px" }
    );
    host._activityPaginationObserver.observe(loadMore);
  }
};
