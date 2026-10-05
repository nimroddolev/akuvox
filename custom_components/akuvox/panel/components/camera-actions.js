/**
 * Helper to inject Open Door relay buttons directly into Home Assistant's native more-info-camera dialog.
 */

import { findInComposedTree, escapeHtml } from "../utils/dom.js";
import { icons } from "../utils/icons.js?v=20260926-device-preview-refresh";
import { orientationTransform } from "../utils/orientation.js?v=20260820-camera-orientation";
import { t } from "../utils/i18n.js?v=20261005-pseudo-spanish";

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

  const nativeSnapshotAction = actions.querySelector("ha-progress-button") || [
    ...actions.querySelectorAll("button, ha-button, mwc-button, a"),
  ].find((action) => /download snapshot/i.test(action.textContent || ""));
  let snapshotButton;

  actions.querySelector(".akuvox-camera-relay-actions")?.remove();
  if (nativeSnapshotAction) {
    // Home Assistant renders this control through ha-progress-button. Apply
    // the panel action metrics to its actual button, not its wrapper.
    nativeSnapshotAction.style.setProperty("--ha-button-border-radius", "8px");
    nativeSnapshotAction.style.setProperty("--mdc-shape-small", "8px");
    nativeSnapshotAction.style.borderRadius = "8px";
    // The action's known component chain is ha-progress-button → ha-button
    // → button. Prefer it over a generic deep lookup so the icon is inserted
    // into the actual rendered control.
    snapshotButton =
      nativeSnapshotAction.shadowRoot?.querySelector("ha-button")?.shadowRoot?.querySelector("button") ||
      findInComposedTree(nativeSnapshotAction, "button");
    if (snapshotButton) {
      snapshotButton.style.cssText +=
        ";display:inline-flex;align-items:center;justify-content:center;gap:5px;" +
        "min-height:38px;height:38px;padding:8px 10px;text-align:center;white-space:nowrap;";
      if (!snapshotButton.querySelector(".akuvox-snapshot-download-icon")) {
        const icon = documentRef.createElement("span");
        icon.className = "akuvox-snapshot-download-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = icons.download;
        icon.querySelector("svg")?.setAttribute("style", "width:20px;height:20px;flex:0 0 auto;");
        snapshotButton.prepend(icon);
      }
      const label = t(host, "Download snapshot");
      const replaceLabel = (root) => {
        const textNodes = [];
        const walker = documentRef.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.filter((node) => node.nodeValue.trim()).forEach((node) => { node.nodeValue = label; });
      };
      replaceLabel(nativeSnapshotAction);
      replaceLabel(snapshotButton);
      nativeSnapshotAction.setAttribute("aria-label", label);
      snapshotButton.setAttribute("aria-label", label);
    }
  }

  if (!relays.length) return;

  // The host actions are Home Assistant-owned, but this particular camera
  // action row only contains the snapshot action and our relay controls.
  // Center the complete row rather than leaving either action against an edge.
  actions.style.justifyContent = "center";

  const group = documentRef.createElement("div");
  group.className = "akuvox-camera-relay-actions";
  group.style.cssText =
    "display:flex;flex-wrap:wrap;gap:8px;order:-1;";

  const labels = relays.map((relay) =>
    String(relay.door_name || relay.name || `Relay ${relay.relay_id}`)
  );
  const unlockStyle = host.hasAttribute("dark")
    ? "color:#fca5a5;background:#3f252b;"
    : "color:#a12828;background:#ffebee;";

  relays.forEach((relay, index) => {
    const button = nativeSnapshotAction?.tagName === "HA-PROGRESS-BUTTON"
      ? documentRef.createElement("button")
      : nativeSnapshotAction?.cloneNode(false) || documentRef.createElement("button");
    const duplicate =
      labels.filter((label) => label === labels[index]).length > 1;
    const name = t(host, "Unlock");
    const accessibleName =
      relays.length === 1
        ? name
        : `${name} ${labels[index]}${duplicate ? ` (relay ${relay.relay_id})` : ""}`;

    button.setAttribute("type", "button");
    button.removeAttribute("disabled");
    button.setAttribute("aria-label", accessibleName);
    button.classList.add("device-action", "device-unlock-action");
    button.innerHTML = `${icons.unlock}<span>${escapeHtml(name)}</span>`;
    // Mirror the panel tile action exactly rather than adopting Home
    // Assistant's destructive red button treatment from the snapshot clone.
    button.style.cssText =
      `display:inline-flex;align-items:center;justify-content:center;gap:5px;` +
      `box-sizing:border-box;min-height:38px;height:38px;padding:8px 10px;` +
      `border:0;border-radius:8px;font:500 13px/1 inherit;text-align:center;` +
      `white-space:nowrap;cursor:pointer;${unlockStyle}`;
    button.querySelector("svg").style.cssText =
      "width:20px;height:20px;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;";

    button.addEventListener("click", () => {
      void host._relay(relay.mac, relay.relay_id);
    });

    group.append(button);
  });

  actions.prepend(group);

  // The native snapshot action lives in nested Home Assistant components,
  // whose button rules can override normal inline values. Match the final
  // rendered typography and corner shape of the relay action beside it.
  const relayButton = group.querySelector("button");
  if (snapshotButton && relayButton) {
    const relayStyle = window.getComputedStyle(relayButton);
    [
      ["font-family", relayStyle.fontFamily],
      ["font-size", relayStyle.fontSize],
      ["font-weight", relayStyle.fontWeight],
      ["line-height", relayStyle.lineHeight],
      ["border-radius", relayStyle.borderRadius],
    ].forEach(([property, value]) => snapshotButton.style.setProperty(property, value, "important"));

    // Keep the native download-snapshot control and every injected unlock
    // control aligned, regardless of translated label length or icon size.
    const actionWidth = Math.ceil(Math.max(
      snapshotButton.getBoundingClientRect().width,
      ...[...group.querySelectorAll("button")].map((button) => button.getBoundingClientRect().width),
    ));
    const width = `${actionWidth}px`;
    snapshotButton.style.setProperty("width", width, "important");
    snapshotButton.style.setProperty("min-width", width, "important");
    nativeSnapshotAction.style.setProperty("width", width, "important");
    nativeSnapshotAction.style.setProperty("min-width", width, "important");
    group.querySelectorAll("button").forEach((button) => {
      button.style.width = width;
      button.style.minWidth = width;
      button.style.flex = `0 0 ${width}`;
    });
  }

};
