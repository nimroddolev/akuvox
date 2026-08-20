/**
 * Helper to inject Open Door relay buttons directly into Home Assistant's native more-info-camera dialog.
 */

import { findInComposedTree, escapeHtml } from "../utils/dom.js";
import { orientationTransform } from "../utils/orientation.js?v=20260820-camera-orientation";

/**
 * Locate Home Assistant's camera modal and inject door relay action buttons.
 * @param {HTMLElement} host
 * @param {Array<object>} relays
 * @param {number} [attempt=0]
 */
export const installCameraRelayActions = (host, relays, orientation = "none", attempt = 0) => {
  const documentRef = host.shadowRoot.ownerDocument;
  const cameraDialog = findInComposedTree(documentRef, "more-info-camera");
  const actions = cameraDialog?.shadowRoot?.querySelector(".actions");

  if (!actions) {
    if (attempt < 12) {
      window.setTimeout(
        () => installCameraRelayActions(host, relays, orientation, attempt + 1),
        100
      );
    }
    return;
  }

  const stream = findInComposedTree(cameraDialog, "ha-camera-stream");
  const media = stream && findInComposedTree(stream, "video, img");
  if (media) media.style.transform = orientationTransform(orientation);

  const nativeSnapshotAction = [
    ...actions.querySelectorAll("button, ha-button, mwc-button, a"),
  ].find((action) => /download snapshot/i.test(action.textContent || ""));

  actions.querySelector(".akuvox-camera-relay-actions")?.remove();
  host._clearCameraRelayCountdowns?.();

  if (nativeSnapshotAction) {
    const walker = documentRef.createTreeWalker(
      nativeSnapshotAction,
      NodeFilter.SHOW_TEXT
    );
    while (walker.nextNode()) {
      walker.currentNode.nodeValue = walker.currentNode.nodeValue.replace(
        /snapshot/gi,
        "Snapshot"
      );
    }
  }

  const group = documentRef.createElement("div");
  group.className = "akuvox-camera-relay-actions";
  group.style.cssText =
    "display:flex;flex-wrap:wrap;gap:8px;margin-right:auto;order:-1;";

  const labels = relays.map((relay) =>
    String(relay.door_name || relay.name || `Relay ${relay.relay_id}`)
  );

  relays.forEach((relay, index) => {
    const button =
      nativeSnapshotAction?.cloneNode(false) ||
      documentRef.createElement("button");
    const duplicate =
      labels.filter((label) => label === labels[index]).length > 1;
    const name =
      relays.length === 1
        ? "Open Door"
        : `Open ${labels[index]}${duplicate ? ` (relay ${relay.relay_id})` : ""}`;

    button.setAttribute("type", "button");
    button.removeAttribute("disabled");
    button.setAttribute("aria-label", name);
    button.innerHTML = `<ha-icon icon="mdi:door-open" aria-hidden="true"></ha-icon><span>${escapeHtml(name)}</span>`;
    button.style.cssText +=
      ";min-height:36px;padding:0 12px;border:0;border-radius:8px;color:#fff;background:#55bfe6;justify-content:center;text-align:center;";

    if (!nativeSnapshotAction) {
      button.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:0 12px;border:0;border-radius:8px;color:#fff;background:#55bfe6;font:500 14px/1 inherit;text-align:center;white-space:nowrap;cursor:pointer;";
    }
    button.querySelector("ha-icon").style.cssText = "--mdc-icon-size:20px;";

    button.addEventListener("mouseenter", () => {
      if (!host._cameraRelayCountdowns?.has(button)) {
        button.style.background = "#76c8c3";
      }
    });
    button.addEventListener("mouseleave", () => {
      if (!host._cameraRelayCountdowns?.has(button)) {
        button.style.background = "#55bfe6";
      }
    });

    button.addEventListener("click", () => {
      void host._cameraRelayCountdown(button, relay);
    });

    group.append(button);
  });

  actions.prepend(group);

};
