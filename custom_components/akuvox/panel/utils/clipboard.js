/**
 * Clipboard operations with fallback for secure and non-secure browser contexts.
 */

/**
 * Copy text to clipboard using the modern Async Clipboard API with document.execCommand fallback.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // Fall through to the browser-compatible legacy copy method
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;opacity:0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return copied;
};
