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

/** Open a floating context menu using the shared temporary-key menu treatment. */
export const showActionsMenu = (host, trigger, event, { id, label, actions }) => {
  event.stopPropagation();
  if (!id || !actions.length) return;

  if (host._keyActionsMenu?.dataset.actionMenuId === id) {
    closeKeyActionsMenu(host);
    return;
  }
  closeKeyActionsMenu(host);

  const documentRef = host.shadowRoot.ownerDocument;
  const menu = documentRef.createElement("div");
  const bounds = trigger.getBoundingClientRect();
  menu.dataset.actionMenuId = id;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label);
  menu.style.cssText = "position:fixed;z-index:10001;top:12px;left:12px;width:max-content;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow-y:auto;padding:8px;border:1px solid var(--divider-color,#d1d5db);border-radius:14px;background:var(--card-background-color,#fff);box-shadow:0 14px 32px #0003;";

  menu.innerHTML = actions.map((action) => `<button type="button" role="menuitem" data-menu-action="${action.id}" class="${action.danger ? "delete-action" : ""}" ${action.disabled ? "disabled" : ""} ${action.title ? `title="${action.title}"` : ""}>${action.icon}<span>${action.label}</span></button>`).join("");

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
  menu.querySelectorAll(".delete-action").forEach((button) => {
    button.style.color = "var(--error-color,#dc2626)";
  });

  actions.forEach((action) => {
    menu.querySelector(`[data-menu-action="${action.id}"]`)?.addEventListener("click", () => {
      if (action.disabled) return;
      closeKeyActionsMenu(host);
      action.onSelect?.();
    });
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

  const menuBounds = menu.getBoundingClientRect();
  const menuWidth = menuBounds.width;
  const maxTop = Math.max(12, window.innerHeight - menuBounds.height - 12);
  const belowTop = bounds.bottom + 8;
  const aboveTop = bounds.top - menuBounds.height - 8;
  const menuTop = belowTop <= maxTop || aboveTop < 12
    ? Math.min(belowTop, maxTop)
    : aboveTop;
  menu.style.top = `${Math.max(12, menuTop)}px`;
  menu.style.left = `${Math.max(12, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 12))}px`;
};

/** Open the context menu for a temporary key row. */
export const showKeyActionsMenu = (host, trigger, event, { onQr, onEdit, onDelete }) => {
  const keyId = trigger.dataset.keyMenu;
  const keyCode = trigger.dataset.keyCode;
  const expired = trigger.dataset.keyExpired === "true";
  const hasQrCode = trigger.dataset.keyHasQr === "true";
  const canEdit = trigger.dataset.keyCanEdit !== "false";
  if (!keyId || !keyCode) return;

  const actions = [
    !expired && hasQrCode && { id: "qr", label: "QR Code", icon: icons.eye, onSelect: () => onQr?.(keyId) },
    !expired && { id: "edit", label: "Edit", icon: icons.edit, disabled: !canEdit, title: canEdit ? "" : "Editing requires permission for every relay in this key", onSelect: () => onEdit?.(keyId) },
    { id: "delete", label: "Delete", icon: icons.trash, danger: true, onSelect: () => onDelete?.(keyCode) },
  ].filter(Boolean);
  showActionsMenu(host, trigger, event, { id: `key:${keyId}`, label: "Temporary key actions", actions });
};
