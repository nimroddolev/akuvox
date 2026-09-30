/**
 * Helper to inject Open Door relay buttons directly into Home Assistant's native more-info-camera dialog.
 */

import { findInComposedTree, escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260926-device-preview-refresh";
import { orientationTransform } from "../utils/orientation.js?v=20260820-camera-orientation";

const installCameraStreamLoader = (host, cameraDialog, orientation, attempt = 0) => {
  const stream = findInComposedTree(cameraDialog.shadowRoot, "ha-camera-stream");
  if (!stream?.shadowRoot) {
    if (attempt < 24) {
      window.setTimeout(
        () => installCameraStreamLoader(host, cameraDialog, orientation, attempt + 1),
        50
      );
    }
    return;
  }

  const streamRoot = stream.shadowRoot;
  if (!streamRoot.querySelector("[data-akuvox-stream-loader-styles]")) {
    const style = host.shadowRoot.ownerDocument.createElement("style");
    style.dataset.akuvoxStreamLoaderStyles = "";
    style.textContent = `
      :host { position: relative; display: block; aspect-ratio: 4 / 3; min-height: 0; }
      .akuvox-stream-loader { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; pointer-events: none; background: var(--card-background-color, #fff); }
      .akuvox-stream-loader[hidden] { display: none; }
      .akuvox-stream-loader__spinner { width: 36px; height: 36px; box-sizing: border-box; border: 4px solid color-mix(in srgb, var(--primary-color, #03a9f4) 25%, transparent); border-top-color: var(--primary-color, #03a9f4); border-radius: 50%; animation: akuvox-stream-loader-spin .8s linear infinite; }
      @keyframes akuvox-stream-loader-spin { to { transform: rotate(360deg); } }
    `;
    streamRoot.append(style);
  }

  let loader = streamRoot.querySelector(".akuvox-stream-loader");
  if (!loader) {
    loader = host.shadowRoot.ownerDocument.createElement("div");
    loader.className = "akuvox-stream-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-label", "Loading camera stream");
    loader.innerHTML = '<span class="akuvox-stream-loader__spinner" aria-hidden="true"></span>';
    streamRoot.append(loader);
  }

  const media = findInComposedTree(stream.shadowRoot, "video, img");
  if (!media) {
    if (attempt < 24) {
      window.setTimeout(
        () => installCameraStreamLoader(host, cameraDialog, orientation, attempt + 1),
        50
      );
    }
    return;
  }

  const revealStream = () => {
    loader.hidden = true;
  };
  const checkStreamReady = (checkAttempt = 0) => {
    if (!stream.isConnected || loader.hidden) return;
    // Home Assistant's HLS player can replace its internal <video> while it
    // starts. Re-query it here instead of depending solely on listeners that
    // may have been attached to the element it replaced.
    const currentMedia = findInComposedTree(stream.shadowRoot, "video, img");
    if (currentMedia?.tagName === "VIDEO") {
      currentMedia.style.transform = orientationTransform(orientation);
      if (currentMedia.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        revealStream();
        return;
      }
    } else if (currentMedia?.complete && currentMedia.naturalWidth > 0) {
      revealStream();
      return;
    }
    if (checkAttempt < 300) {
      window.setTimeout(() => checkStreamReady(checkAttempt + 1), 50);
    }
  };

  media.style.transform = orientationTransform(orientation);
  if (media.tagName === "VIDEO") {
    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) revealStream();
    else ["loadeddata", "canplay", "playing"].forEach((eventName) => media.addEventListener(eventName, revealStream, { once: true }));
  } else if (media.complete && media.naturalWidth > 0) {
    revealStream();
  } else {
    media.addEventListener("load", revealStream, { once: true });
  }
  checkStreamReady();
};

/**
 * Locate Home Assistant's camera modal and inject door relay action buttons.
 * @param {HTMLElement} host
 * @param {Array<object>} relays
 * @param {number} [attempt=0]
 */
export const installCameraRelayActions = (host, relays, orientation = "none", attempt = 0) => {
  const documentRef = host.shadowRoot.ownerDocument;
  const cameraDialog = findInComposedTree(documentRef, "more-info-camera");
  if (cameraDialog) installCameraStreamLoader(host, cameraDialog, orientation);
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

  if (!relays.length) return;

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
    button.innerHTML = `${icons.unlock}<span>${escapeHtml(name)}</span>`;
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
