/**
 * Generic modal dialog helpers: notice, confirmation, and async WS blocker overlay.
 */

import { closeOnBackdrop } from "../utils/dom.js";
import { icons } from "../utils/icons.js";
import { t } from "../utils/i18n.js?v=20261004-rtsp-copy-dialog";

const titleCase = (title) => String(title).replace(/\b\w/g, (letter) => letter.toUpperCase());
const isFailureTitle = (title) => /failed|could not|unavailable|required|invalid|error/i.test(title);

const addResultIcon = (dialog, successful) => {
  const icon = dialog.ownerDocument.createElement("span");
  icon.className = `result-icon ${successful ? "success" : "failure"}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = successful ? "✓" : "×";
  dialog.append(icon);
};

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

  heading.textContent = titleCase(t(host, title));
  text.textContent = t(host, message);
  actions.className = "modal-actions";
  closeButton.type = "button";
  closeButton.className = "modal-action";
  closeButton.textContent = t(host, "OK");
  closeButton.addEventListener("click", () => dialog.close());

  actions.append(closeButton);
  if (isFailureTitle(title)) addResultIcon(dialog, false);
  dialog.append(heading);
  if (text.textContent) dialog.append(text);
  dialog.append(actions);
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

/** Show a pairing confirmation with an explicit local clipboard action. */
export const showPairingLinkNotice = (host, pairingLink) => new Promise((resolve) => {
  const documentRef = host.shadowRoot.ownerDocument;
  const dialog = documentRef.createElement("dialog");
  const heading = documentRef.createElement("h2");
  const text = documentRef.createElement("p");
  const linkRow = documentRef.createElement("div");
  const linkInput = documentRef.createElement("input");
  const actions = documentRef.createElement("div");
  const copyButton = documentRef.createElement("button");
  const closeButton = documentRef.createElement("button");
  let copyResetTimer;

  heading.textContent = t(host, "Pairing Link Created");
  text.innerHTML = t(host, "Copy the link and provide it to the user of the remote Home Assistant instance.<br>This link will not be shown again once you close this dialogue.<br><br><span class=\"warning-icon\" aria-hidden=\"true\">!</span> Only share this link with someone you trust.");
  linkRow.className = "pairing-link-row";
  linkInput.className = "pairing-link-value";
  linkInput.type = "text";
  linkInput.value = pairingLink;
  linkInput.readOnly = true;
  linkInput.setAttribute("aria-label", t(host, "Pairing link"));
  actions.className = "modal-actions";
  copyButton.type = "button";
  copyButton.className = "pairing-link-copy";
  copyButton.setAttribute("aria-label", t(host, "Copy pairing link"));
  copyButton.title = t(host, "Copy pairing link");
  copyButton.innerHTML = icons.copy;
  closeButton.type = "button";
  closeButton.className = "modal-action";
  closeButton.textContent = t(host, "OK");
  copyButton.addEventListener("click", async () => {
    try {
      await documentRef.defaultView.navigator.clipboard.writeText(pairingLink);
      documentRef.defaultView.clearTimeout(copyResetTimer);
      copyButton.innerHTML = `${icons.check}<span>${t(host, "Copied")}</span>`;
      copyButton.classList.add("is-copied");
      copyButton.title = t(host, "Copied");
      copyButton.setAttribute("aria-label", t(host, "Pairing link copied"));
      linkInput.select();
      copyResetTimer = documentRef.defaultView.setTimeout(() => {
        copyButton.innerHTML = icons.copy;
        copyButton.classList.remove("is-copied");
        copyButton.title = t(host, "Copy pairing link");
        copyButton.setAttribute("aria-label", t(host, "Copy pairing link"));
      }, 1000);
    } catch (_) {
      linkInput.select();
      copyButton.title = t(host, "Copy manually from the selected link");
    }
  });
  closeButton.addEventListener("click", () => dialog.close());
  linkRow.append(linkInput, copyButton);
  actions.append(closeButton);
  addResultIcon(dialog, true);
  dialog.append(heading, text, linkRow, actions);
  closeOnBackdrop(dialog);

  host._modalCount = (host._modalCount || 0) + 1;
  dialog.addEventListener("close", () => {
    documentRef.defaultView.clearTimeout(copyResetTimer);
    host._modalCount -= 1;
    dialog.remove();
    host._requestLoad?.();
    resolve();
  }, { once: true });
  host.shadowRoot.append(dialog);
  dialog.showModal();
  closeButton.focus();
});

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
    heading.textContent = t(host, title);
    text.textContent = t(host, message);
    actions.className = "modal-actions";

    cancelButton.type = "button";
    cancelButton.className = "modal-cancel";
    cancelButton.textContent = t(host, "Cancel");

    actionButton.type = "button";
    actionButton.className = "modal-action";
    actionButton.textContent = t(host, actionLabel);

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
  spinner.setAttribute("aria-label", t(host, "Saving"));
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
