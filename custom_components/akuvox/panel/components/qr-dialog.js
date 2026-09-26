/**
 * Temporary Key QR code dialog with image preview and download functionality.
 */

import { closeOnBackdrop } from "../utils/dom.js";
import { icons } from "../utils/icons.js";
import { showNotice } from "./dialogs.js";

/**
 * Display the QR code modal for a temporary key.
 * @param {HTMLElement} host
 * @param {string} keyId
 */
export const showTemporaryKeyQrDialog = async (host, keyId) => {
  const key = host._account()?.temporary_keys?.find(
    (item) => String(item.key_id) === String(keyId)
  );
  const documentRef = host.shadowRoot.ownerDocument;
  const dialog = documentRef.createElement("dialog");
  const heading = documentRef.createElement("h2");
  const content = documentRef.createElement("div");
  const loading = documentRef.createElement("div");
  const picture = documentRef.createElement("img");
  const actions = documentRef.createElement("div");
  const save = documentRef.createElement("button");
  const close = documentRef.createElement("button");

  dialog.className = "activity-image-dialog temporary-key-qr-dialog";
  heading.textContent = `${key?.description || "Temporary key"} QR code`;
  content.className = "temporary-key-qr-content";
  loading.className = "temporary-key-qr-loading";
  loading.setAttribute("role", "status");
  loading.innerHTML = '<span class="temporary-key-qr-spinner" aria-hidden="true"></span><span class="sr-only">Generating QR code</span>';
  picture.hidden = true;
  picture.alt = heading.textContent;
  content.append(loading, picture);
  actions.className = "modal-actions";

  save.className = "modal-action modal-icon";
  save.type = "button";
  save.disabled = true;
  save.setAttribute("aria-label", "Download QR code");
  save.title = "Download QR code";
  save.innerHTML = icons.download;

  close.className = "modal-cancel";
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());

  actions.append(save, close);
  dialog.append(heading, content, actions);
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

  try {
    const image = await host._hass.callWS({
      type: "akuvox/panel_temp_key_qr",
      entry_id: host._activeAccount,
      key_id: keyId,
    });
    if (!dialog.open) return;
    const imageUrl = `data:${image.content_type};base64,${image.data}`;
    const extension =
      image.content_type === "image/jpeg"
        ? "jpg"
        : image.content_type === "image/webp"
          ? "webp"
          : "png";
    const fileName = `akuvox-temporary-key-${String(key?.key_code || keyId).replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;

    const revealPicture = () => {
      if (!dialog.open) return;
      picture.hidden = false;
      loading.remove();
      save.disabled = false;
    };
    picture.addEventListener("load", revealPicture, { once: true });
    picture.addEventListener(
      "error",
      () => {
        if (!dialog.open) return;
        dialog.close();
        showNotice(
          host,
          "The temporary key QR code could not be displayed.",
          "QR code unavailable"
        );
      },
      { once: true }
    );
    picture.src = imageUrl;
    save.addEventListener("click", () => {
      const download = documentRef.createElement("a");
      download.href = imageUrl;
      download.download = fileName;
      documentRef.body.append(download);
      download.click();
      download.remove();
    });

  } catch (_) {
    if (!dialog.open) return;
    dialog.close();
    showNotice(
      host,
      "The temporary key QR code could not be retrieved.",
      "QR code unavailable"
    );
  }
};
