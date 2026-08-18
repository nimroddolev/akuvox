/**
 * Generic modal dialog helpers: notice, confirmation, and async WS blocker overlay.
 */

import { closeOnBackdrop } from "../utils/dom.js";

/**
 * Show a simple informational modal dialog.
 * @param {HTMLElement} host
 * @param {string} message
 * @param {string} [title="Akuvox SmartPlus"]
 */
export const showNotice = (host, message, title = "Akuvox SmartPlus") => {
  const documentRef = host.shadowRoot.ownerDocument;
  const dialog = documentRef.createElement("dialog");
  const heading = documentRef.createElement("h2");
  const text = documentRef.createElement("p");
  const actions = documentRef.createElement("div");
  const closeButton = documentRef.createElement("button");

  heading.textContent = title;
  text.textContent = message;
  actions.className = "modal-actions";
  closeButton.type = "button";
  closeButton.className = "modal-action";
  closeButton.textContent = "OK";
  closeButton.addEventListener("click", () => dialog.close());

  actions.append(closeButton);
  dialog.append(heading, text, actions);
  closeOnBackdrop(dialog);

  host._modalCount = (host._modalCount || 0) + 1;
  dialog.addEventListener(
    "close",
    () => {
      host._modalCount -= 1;
      dialog.remove();
      host._requestLoad?.();
    },
    { once: true }
  );

  host.shadowRoot.append(dialog);
  dialog.showModal();
  closeButton.focus();
};

/**
 * Show a confirmation modal dialog with Cancel / Action buttons.
 * @param {HTMLElement} host
 * @param {string} message
 * @param {string} title
 * @param {string} actionLabel
 * @returns {Promise<boolean>}
 */
export const confirmModal = (host, message, title, actionLabel) => {
  return new Promise((resolve) => {
    const documentRef = host.shadowRoot.ownerDocument;
    const dialog = documentRef.createElement("dialog");
    const heading = documentRef.createElement("h2");
    const text = documentRef.createElement("p");
    const actions = documentRef.createElement("div");
    const cancelButton = documentRef.createElement("button");
    const actionButton = documentRef.createElement("button");

    let confirmed = false;
    heading.textContent = title;
    text.textContent = message;
    actions.className = "modal-actions";

    cancelButton.type = "button";
    cancelButton.className = "modal-cancel";
    cancelButton.textContent = "Cancel";

    actionButton.type = "button";
    actionButton.className = "modal-action";
    actionButton.textContent = actionLabel;

    cancelButton.addEventListener("click", () => dialog.close());
    actionButton.addEventListener("click", () => {
      confirmed = true;
      dialog.close();
    });

    actions.append(cancelButton, actionButton);
    dialog.append(heading, text, actions);
    closeOnBackdrop(dialog);

    host._modalCount = (host._modalCount || 0) + 1;
    dialog.addEventListener(
      "close",
      () => {
        host._modalCount -= 1;
        dialog.remove();
        host._requestLoad?.();
        resolve(confirmed);
      },
      { once: true }
    );

    host.shadowRoot.append(dialog);
    dialog.showModal();
    cancelButton.focus();
  });
};

/**
 * Call a Home Assistant WebSocket command while displaying a blocking page spinner overlay.
 * @param {HTMLElement} host
 * @param {object} message
 * @returns {Promise<any>}
 */
export const callWsWithBlocker = async (host, message) => {
  const documentRef = host.shadowRoot.ownerDocument;
  const blocker = documentRef.createElement("div");
  const spinner = documentRef.createElement("span");

  host._blockingRequest = true;
  blocker.className = "page-blocker";
  blocker.setAttribute("aria-busy", "true");
  spinner.className = "page-blocker-spinner";
  spinner.setAttribute("aria-label", "Saving");
  spinner.setAttribute("role", "status");

  blocker.append(spinner);
  host.shadowRoot.append(blocker);
  requestAnimationFrame(() => blocker.classList.add("visible"));

  try {
    return await host._hass.callWS(message);
  } finally {
    blocker.classList.remove("visible");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    blocker.remove();
    host._blockingRequest = false;
    if (host._loadQueued) host._requestLoad?.();
  }
};
