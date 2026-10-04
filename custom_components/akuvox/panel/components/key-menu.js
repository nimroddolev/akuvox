/**
 * Floating context action menu for temporary keys.
 */

import { icons } from "../utils/icons.js?v=20260928-qr-menu-eye";
import { localizeElement } from "../utils/i18n.js?v=20261003-hebrew-rtl";

/**
 * Close any currently active key actions menu and clean up event listeners.
 * @param {HTMLElement} host
 */
export const closeKeyActionsMenu = (host) => {
  host._keyActionsMenu?.remove();
  host._keyActionsMenu = undefined;
  host._keyActionsMenuAbort?.abort();
  host._keyActionsMenuAbort = undefined;
};

/**
 * Open the context menu for a temporary key row.
 * @param {HTMLElement} host
 * @param {HTMLElement} trigger
 * @param {Event} event
 * @param {object} callbacks
 * @param {(keyId: string) => void} callbacks.onQr
 * @param {(keyId: string) => void} callbacks.onEdit
 * @param {(keyCode: string) => void} callbacks.onDelete
 */
export const showKeyActionsMenu = (host, trigger, event, { onQr, onEdit, onDelete }) => {
  event.stopPropagation();
  const keyId = trigger.dataset.keyMenu;
  const keyCode = trigger.dataset.keyCode;
  const expired = trigger.dataset.keyExpired === "true";
  const hasQrCode = trigger.dataset.keyHasQr === "true";
  const canEdit = trigger.dataset.keyCanEdit !== "false";
  if (!keyId || !keyCode) return;

  if (host._keyActionsMenu?.dataset.keyId === keyId) {
    closeKeyActionsMenu(host);
    return;
  }
  closeKeyActionsMenu(host);

  const documentRef = host.shadowRoot.ownerDocument;
  const menu = documentRef.createElement("div");
  const bounds = trigger.getBoundingClientRect();
  menu.dataset.keyId = keyId;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Temporary key actions");
  menu.style.cssText = `position:fixed;z-index:10001;top:${bounds.bottom + 8}px;left:12px;width:max-content;max-width:calc(100vw - 24px);padding:8px;border:1px solid var(--divider-color,#d1d5db);border-radius:14px;background:var(--card-background-color,#fff);box-shadow:0 14px 32px #0003;`;

  menu.innerHTML = `
    ${!expired && hasQrCode ? `<button type="button" role="menuitem" data-menu-qr>${icons.eye}<span>QR Code</span></button>` : ""}
    ${!expired ? `<button type="button" role="menuitem" data-menu-edit ${canEdit ? "" : "disabled title=\"Editing requires permission for every relay in this key\""}>${icons.edit}<span>Edit</span></button>` : ""}
    <button type="button" role="menuitem" data-menu-delete class="delete-action">${icons.trash}<span>Delete</span></button>
  `;

  menu.querySelectorAll("button").forEach((button) => {
    button.style.cssText =
      "display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:9px;padding:11px 12px;color:inherit;background:transparent;font:600 14px/1.3 inherit;text-align:left;white-space:nowrap;";
    if (button.disabled) {
      button.style.color = "var(--disabled-text-color, #8b8b8b)";
      button.style.cursor = "not-allowed";
      button.style.opacity = "1";
    }
    button.addEventListener("mouseenter", () => {
      if (button.disabled) return;
      button.style.background = button.classList.contains("delete-action")
        ? "#dc2626"
        : "#55bfe6";
      if (button.classList.contains("delete-action")) button.style.color = "#fff";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
      if (button.classList.contains("delete-action")) {
        button.style.color = "var(--error-color,#dc2626)";
      }
    });
  });

  menu.querySelectorAll("svg").forEach((icon) => {
    icon.style.cssText =
      "width:19px;height:19px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;";
  });
  menu.querySelector(".delete-action").style.color = "var(--error-color,#dc2626)";

  menu.querySelector("[data-menu-qr]")?.addEventListener("click", () => {
    closeKeyActionsMenu(host);
    onQr?.(keyId);
  });
  menu.querySelector("[data-menu-edit]")?.addEventListener("click", () => {
    closeKeyActionsMenu(host);
    onEdit?.(keyId);
  });
  menu.querySelector("[data-menu-delete]")?.addEventListener("click", () => {
    closeKeyActionsMenu(host);
    onDelete?.(keyCode);
  });

  const abort = new AbortController();
  documentRef.addEventListener(
    "pointerdown",
    (outsideEvent) => {
      const clickPath = outsideEvent.composedPath();
      if (!clickPath.includes(menu) && !clickPath.includes(trigger)) {
        closeKeyActionsMenu(host);
      }
    },
    { capture: true, signal: abort.signal }
  );

  documentRef.addEventListener(
    "keydown",
    (keyEvent) => {
      if (keyEvent.key === "Escape") closeKeyActionsMenu(host);
    },
    { signal: abort.signal }
  );

  host._keyActionsMenu = menu;
  host._keyActionsMenuAbort = abort;
  documentRef.body.append(menu);
  localizeElement(host, menu);

  const menuWidth = menu.getBoundingClientRect().width;
  menu.style.left = `${Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12))}px`;
};
