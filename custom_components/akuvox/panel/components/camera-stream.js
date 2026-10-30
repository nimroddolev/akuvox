/** Keep the native camera player stable while its first video frame loads. */
import { findInComposedTree } from "../utils/dom.js";
import { orientationTransform } from "../utils/orientation.js?v=20260820-camera-orientation";

export const installCameraStream = (host, dialog, orientation, aspectRatio, attempt = 0) => {
  if (!dialog.isConnected) return;
  const stream = findInComposedTree(dialog.shadowRoot, "ha-camera-stream");
  if (!stream?.shadowRoot) {
    if (attempt < 24) window.setTimeout(
      () => installCameraStream(host, dialog, orientation, aspectRatio, attempt + 1), 50
    );
    return;
  }
  const root = stream.shadowRoot;
  if (root.querySelector("[data-akuvox-stream-style]")) return;

  let modal = dialog;
  while (modal && !modal.matches("ha-adaptive-dialog, ha-dialog")) {
    modal = modal.parentElement || modal.getRootNode().host;
  }
  const centeredStyles = {
    "--dialog-surface-margin-top": "auto",
    "--vertical-align-dialog": "center",
    "--ha-dialog-max-height": "calc(100svh - 80px - var(--safe-area-inset-y, 0px))",
  };
  const previousStyles = Object.keys(centeredStyles).map((property) =>
    [property, modal?.style.getPropertyValue(property) || ""]
  );
  Object.entries(centeredStyles).forEach(([property, value]) =>
    modal?.style.setProperty(property, value)
  );

  const documentRef = host.shadowRoot.ownerDocument;
  const style = documentRef.createElement("style");
  style.dataset.akuvoxStreamStyle = "";
  // Reserve the preview's intrinsic ratio before HLS supplies video dimensions.
  // Position the player inside it so loading cannot expand or collapse the modal.
  style.textContent = `
    :host { position: relative; display: block; width: 100%; height: auto !important; aspect-ratio: ${aspectRatio}; }
    ha-hls-player, img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .akuvox-stream-loader { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; pointer-events: none; }
    .akuvox-stream-loader[hidden] { display: none; }
    .akuvox-stream-spinner { width: 36px; height: 36px; box-sizing: border-box; border: 4px solid color-mix(in srgb, var(--primary-color, #03a9f4) 25%, transparent); border-top-color: var(--primary-color, #03a9f4); border-radius: 50%; animation: akuvox-stream-spin .8s linear infinite; }
    @keyframes akuvox-stream-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .akuvox-stream-spinner { animation: none; } }
  `;
  const loader = documentRef.createElement("div");
  loader.className = "akuvox-stream-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-label", "Loading camera stream");
  const spinner = documentRef.createElement("span");
  spinner.className = "akuvox-stream-spinner";
  spinner.setAttribute("aria-hidden", "true");
  loader.append(spinner);
  root.append(style, loader);

  const check = () => {
    if (!dialog.isConnected || !stream.isConnected) {
      previousStyles.forEach(([property, value]) => {
        if (value) modal?.style.setProperty(property, value);
        else modal?.style.removeProperty(property);
      });
      return;
    }
    // HLS can replace its video element during startup. Inspect the current one
    // and keep the spinner visible for snapshots, which are not live playback.
    const video = findInComposedTree(root, "video");
    const image = findInComposedTree(root, "img");
    if (image) image.style.transform = orientationTransform(orientation);
    if (video) video.style.transform = orientationTransform(orientation);
    loader.hidden = Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    window.setTimeout(check, 100);
  };
  check();
};
