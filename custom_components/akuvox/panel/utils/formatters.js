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

/**
 * Parse an API date/time string into an HTML datetime-local compatible format (YYYY-MM-DDTHH:MM).
 * @param {string} value
 * @returns {string}
 */
export const parseDateTimeInput = (value) => {
  const match = String(value || "").match(
    /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})|(?:\d{2})-(\d{2})-(\d{4})[ T](\d{2}:\d{2})/
  );
  return match
    ? match[1]
      ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}`
      : `${match[7]}-${match[6]}-${match[5]}T${match[8]}`
    : "";
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



