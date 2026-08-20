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

    if (!nativeSnapshotAction) {
      button.style.cssText =
        "display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 8px;border:0;border-radius:0;color:var(--primary-color,#03a9d9);background:transparent;font:500 14px/1 inherit;white-space:nowrap;cursor:pointer;";
    }
    button.querySelector("ha-icon").style.cssText = "--mdc-icon-size:20px;";

    if (!nativeSnapshotAction) {
      button.addEventListener("mouseenter", () => {
        button.style.background = "var(--secondary-background-color,#eef4f7)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
    }

    button.addEventListener("click", () => {
      void host._relay(relay.mac, relay.relay_id);
    });

    group.append(button);
  });

  actions.prepend(group);

  // The snapshot control can arrive after the rest of the camera modal. Keep
  // the relay immediately usable, then replace it with HA's native-styled
  // element once that action is available.
  if (!nativeSnapshotAction && attempt < 30) {
    window.setTimeout(
      () => installCameraRelayActions(host, relays, orientation, attempt + 1),
      200
    );
  }
};
