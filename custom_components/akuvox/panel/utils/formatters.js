/**
 * Formatting and input sanitization helpers.
 */

/**
 * Format a Date object as YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
export const toIsoDateString = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Format timestamps without a year when every populated value shares it. */
export const tableTimestampFormatter = (values) => {
  const years = new Set(
    values
      .map((value) => String(value || "").match(/^(\d{4})[-/]/)?.[1])
      .filter(Boolean)
  );
  const hideYear = years.size === 1;
  return (value) =>
    hideYear ? String(value || "").replace(/^\d{4}[-/]/, "") : String(value || "");
};

/** Format a byte count using the panel's decimal storage units. */
export const formatStorageAmount = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, Number(bytes) || 0);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const precision = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unit]}`;
};

/** Parse SmartPlus's local date/time representation without timezone conversion. */
export const parseLocalTimestamp = (value) => {
  const match = String(value || "").match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const timestamp = new Date(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)
  );
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
};

/** Return a localized, compact age label for a SmartPlus local timestamp. */
export const formatRelativeTimestamp = (host, value, translate) => {
  const timestamp = parseLocalTimestamp(value);
  if (!timestamp) return "";
  const now = new Date();
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const withToday = (label) => (
    timestamp.toDateString() === now.toDateString() ? `${translate(host, "Today")} • ${label}` : label
  );
  if (elapsedMinutes < 1) return withToday(translate(host, "Just now"));
  if (elapsedMinutes < 60) {
    return withToday(translate(host, elapsedMinutes === 1 ? "{count} min ago" : "{count} mins ago", { count: elapsedMinutes }));
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return withToday(translate(host, elapsedHours === 1 ? "{count} hour ago" : "{count} hours ago", { count: elapsedHours }));
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return translate(host, elapsedDays === 1 ? "{count} day ago" : "{count} days ago", { count: elapsedDays });
};

/**
 * Parse an API date/time string into an HTML datetime-local compatible format (YYYY-MM-DDTHH:MM).
 * @param {string} value
 * @returns {string}
 */
export const parseDateTimeInput = (value) => {
  const match = String(value || "").match(
    /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})|(\d{2})-(\d{2})-(\d{4})[ T](\d{2}:\d{2})/
  );
  return match
    ? match[1]
      ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}`
      : `${match[7]}-${match[6]}-${match[5]}T${match[8]}`
    : "";
};

/** Format a temporary-key tile timestamp as DD-MM HH:MM. */
export const keyTileTimestamp = (value) => {
  const parsed = parseDateTimeInput(value);
  if (!parsed) return String(value || "");
  const [date, time] = parsed.split("T");
  const [, month, day] = date.split("-");
  return `${day}-${month} ${time}`;
};

/**
 * Normalise and constrain UHF card input to 1-24 hexadecimal characters while preserving cursor position.
 * @param {EventTarget|HTMLInputElement} input
 */
export const normaliseUhfCard = (input) => {
  if (!(input instanceof HTMLInputElement) || input.name !== "uhf_card") return;
  const caret = input.selectionStart;
  const value = input.value.toUpperCase();
  const beforeCaret = caret === null ? "" : value.slice(0, caret);
  const sanitised = value.replace(/[^0-9A-F]/g, "").slice(0, 24);
  if (input.value === sanitised) return;
  input.value = sanitised;
  if (caret !== null) {
    const newPos = beforeCaret.replace(/[^0-9A-F]/g, "").slice(0, 24).length;
    input.setSelectionRange(newPos, newPos);
  }
};

/**
 * License plate validation pattern (0-16 characters, excluding , % & \ < > ' ")
 */
export const LICENSE_PLATE_PATTERN = "[^,%&\\\\<>&#39;&quot;]{0,16}";
export const LICENSE_PLATE_TITLE = "Enter up to 16 characters (cannot contain , % & \\ < > ' \")";
export const LICENSE_PLATE_REGEX = /^[^,%&\\<>'"]{0,16}$/;
export const LICENSE_PLATE_ERROR_MSG = "Enter up to 16 characters (cannot contain , % & \\ < > ' \")";

/**
 * UHF card validation pattern (0-24 hexadecimal characters)
 */
export const UHF_CARD_PATTERN = "[0-9A-Fa-f]{0,24}";
export const UHF_CARD_TITLE = "Enter up to 24 hexadecimal characters (0–9 and A–F)";
export const UHF_CARD_REGEX = /^[0-9A-Fa-f]{0,24}$/;
export const UHF_CARD_ERROR_MSG = "Enter up to 24 hexadecimal characters (0–9 and A–F)";

