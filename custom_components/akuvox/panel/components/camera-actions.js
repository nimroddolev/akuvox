/**
 * Helper to inject Open Door relay buttons directly into Home Assistant's native more-info-camera dialog.
 */

import { findInComposedTree, escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260830-camera-modal-unlock";
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
    const name = "Unlock";
    const accessibleName =
      relays.length === 1
        ? name
        : `${name} ${labels[index]}${duplicate ? ` (relay ${relay.relay_id})` : ""}`;

    button.setAttribute("type", "button");
    button.removeAttribute("disabled");
    button.setAttribute("aria-label", accessibleName);
    button.innerHTML = `${icons.doorOpen}<span>${escapeHtml(name)}</span>`;
    button.style.cssText +=
      ";min-height:36px;padding:8px 10px;border:0;border-radius:8px;color:#fff;background:linear-gradient(135deg,#ff3f3f,#ff6a4f);justify-content:center;text-align:center;";

    if (!nativeSnapshotAction) {
      button.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:36px;padding:8px 10px;border:0;border-radius:8px;color:#fff;background:linear-gradient(135deg,#ff3f3f,#ff6a4f);font:500 14px/1 inherit;text-align:center;white-space:nowrap;cursor:pointer;";
    }
    button.querySelector("svg").style.cssText =
      "width:20px;height:20px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;";

    button.addEventListener("click", () => {
      void host._relay(relay.mac, relay.relay_id);
    });

    group.append(button);
  });

  actions.prepend(group);

};
