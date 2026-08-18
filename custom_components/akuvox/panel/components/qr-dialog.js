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
  try {
    const key = host._account()?.temporary_keys?.find(
      (item) => String(item.key_id) === String(keyId)
    );
    const image = await host._hass.callWS({
      type: "akuvox/panel_temp_key_qr",
      entry_id: host._activeAccount,
      key_id: keyId,
    });

    const documentRef = host.shadowRoot.ownerDocument;
    const dialog = documentRef.createElement("dialog");
    const heading = documentRef.createElement("h2");
    const picture = documentRef.createElement("img");
    const actions = documentRef.createElement("div");
    const save = documentRef.createElement("button");
    const close = documentRef.createElement("button");

    const imageUrl = `data:${image.content_type};base64,${image.data}`;
    const extension =
      image.content_type === "image/jpeg"
        ? "jpg"
        : image.content_type === "image/webp"
          ? "webp"
          : "png";
    const fileName = `akuvox-temporary-key-${String(key?.key_code || keyId).replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;

    dialog.className = "activity-image-dialog temporary-key-qr-dialog";
    heading.textContent = `${key?.description || "Temporary key"} QR code`;
    picture.src = imageUrl;
    picture.alt = heading.textContent;
    actions.className = "modal-actions";

    save.className = "modal-action modal-icon";
    save.type = "button";
    save.setAttribute("aria-label", "Download QR code");
    save.title = "Download QR code";
    save.innerHTML = icons.download;
    save.addEventListener("click", () => {
      const download = documentRef.createElement("a");
      download.href = imageUrl;
      download.download = fileName;
      documentRef.body.append(download);
      download.click();
      download.remove();
    });

    close.className = "modal-cancel";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());

    actions.append(save, close);
    dialog.append(heading, picture, actions);
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
  } catch (_) {
    showNotice(
      host,
      "The temporary key QR code could not be retrieved.",
      "QR code unavailable"
    );
  }
};
