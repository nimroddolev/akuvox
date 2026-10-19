/**
 * DOM manipulation and element traversal utilities.
 */

/**
 * Escape HTML special characters to prevent injection.
 * @param {*} value
 * @returns {string}
 */
export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));

/**
 * Configure dialog to close when user clicks on the backdrop area.
 * @param {HTMLDialogElement} dialog
 * @param {() => boolean|Promise<boolean>} [canClose]
 */
export const closeOnBackdrop = (dialog, canClose = () => true) => {
  let checkingClose = false;
  requestAnimationFrame(() => {
    dialog.addEventListener("click", (event) => {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        if (checkingClose) return;
        checkingClose = true;
        Promise.resolve()
          .then(canClose)
          .then((shouldClose) => {
            if (shouldClose) dialog.close();
          })
          .finally(() => {
            checkingClose = false;
          });
      }
    });
  });
};

/**
 * Capture the current state of a form-like container.
 * @param {Element} container
 * @returns {string}
 */
export const formState = (container) =>
  [...container.querySelectorAll("input, select, textarea")]
    .map((field, index) => {
      const value = field instanceof HTMLInputElement &&
        (field.type === "checkbox" || field.type === "radio")
        ? field.checked
        : field.value;
      return `${index}:${field.type}:${value}`;
    })
    .join("|");

/**
 * Return whether a form-like container differs from a previously captured state.
 * @param {Element} container
 * @param {string} initialState
 * @returns {boolean}
 */
export const hasFormChanges = (container, initialState) => formState(container) !== initialState;

/**
 * Deep query selector penetrating Shadow DOM boundaries.
 * @param {Document|Element|ShadowRoot} root
 * @param {string} selector
 * @returns {Element|null}
 */
export const findInComposedTree = (root, selector) => {
  if (!root) return null;
  if (root instanceof Element && root.matches(selector)) return root;
  const direct = root.querySelector?.(selector);
  if (direct) return direct;
  for (const element of root.querySelectorAll?.("*") || []) {
    if (!element.shadowRoot) continue;
    const match = findInComposedTree(element.shadowRoot, selector);
    if (match) return match;
  }
  return null;
};

/**
 * Apply standardized 2-column responsive grid layout to temporary key modal forms.
 * @param {HTMLFormElement} form
 */
export const applyKeyFormRowLayout = (form) => {
  form
    .querySelectorAll(
      ":scope > label, .key-form-extra-fields > label, .readonly-key-field, .key-relay-row"
    )
    .forEach((row) => {
      row.style.cssText +=
        ";display:grid;grid-template-columns:minmax(160px,30%) minmax(0,1fr);align-items:center;gap:8px;width:100%;margin-inline:auto;";
    });
  form
    .querySelectorAll(
      ":scope > label > span:first-child, .key-form-extra-fields > label > span:first-child, .readonly-key-field > span, .key-relay-row > span"
    )
    .forEach((label) => {
      label.style.cssText +=
        ";justify-self:start;text-align:left;color:inherit;font-weight:600;";
    });
  form
    .querySelectorAll(
      ":scope > label input, .key-form-extra-fields > label input, :scope > label .date-range-field, .field-input-wrap"
    )
    .forEach((field) => {
      field.style.cssText +=
        ";box-sizing:border-box;width:100%;min-width:0;";
    });
  form.querySelectorAll(".readonly-key-field > strong").forEach((value) => {
    value.style.cssText += ";justify-self:start;text-align:left;";
  });
  const relayRow = form.querySelector(".key-relay-row");
  if (relayRow) {
    relayRow.style.alignItems = "start";
    const label = relayRow.querySelector(":scope > span, :scope > legend");
    if (label) {
      label.style.cssText +=
        ";align-self:start;text-align:left;color:inherit;font-weight:600;";
    }
  }
};
