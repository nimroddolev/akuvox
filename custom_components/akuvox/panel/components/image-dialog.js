/**
 * Image viewer dialog components for activity events and call logs.
 */

import { closeOnBackdrop } from "../utils/dom.js";
import { showNotice } from "./dialogs.js";

/**
 * Open the activity image carousel / lightbox dialog with previous/next navigation.
 * @param {HTMLElement} host
 * @param {string} captureTime
 * @param {Array<object>} filteredEvents
 * @param {(captureTime: string) => Promise<object|null>} getActivityImageFn
 */
export const showActivityImageDialog = async (
  host,
  captureTime,
  filteredEvents,
  getActivityImageFn
) => {
  let index = filteredEvents.findIndex((item) => item.CaptureTime === captureTime);
  if (index < 0) return;

  const documentRef = host.shadowRoot.ownerDocument;
  const dialog = documentRef.createElement("dialog");
  const heading = documentRef.createElement("h2");
  const picture = documentRef.createElement("img");
  const details = documentRef.createElement("p");
  const previous = documentRef.createElement("button");
  const next = documentRef.createElement("button");
  const actions = documentRef.createElement("div");
  const closeButton = documentRef.createElement("button");

  heading.textContent = "Activity image";
  details.className = "activity-image-details";
  previous.type = next.type = "button";
  previous.className = "activity-image-nav previous";
  next.className = "activity-image-nav next";
  previous.setAttribute("aria-label", "Previous activity image");
  next.setAttribute("aria-label", "Next activity image");
  previous.textContent = "‹";
  next.textContent = "›";

  actions.className = "modal-actions";
  closeButton.type = "button";
  closeButton.className = "modal-action";
  closeButton.textContent = "Close";

  const renderEvent = async () => {
    const event = filteredEvents[index];
    const image = await getActivityImageFn(event.CaptureTime);
    if (!image || !dialog.open) return;
    picture.alt = `SmartPlus activity at ${event.CaptureTime}`;
    picture.src = `data:${image.content_type};base64,${image.data}`;
    details.textContent = `${event.Initiator || "Unknown"} - ${event.Location || "Unknown door"} - ${event.CaptureTime || "Unknown time"}`;
    previous.hidden = index === 0;
    next.hidden = index === filteredEvents.length - 1;
  };

  previous.addEventListener("click", () => {
    if (index > 0) {
      index -= 1;
      void renderEvent();
    }
  });

  next.addEventListener("click", () => {
    if (index < filteredEvents.length - 1) {
      index += 1;
      void renderEvent();
    }
  });

  closeButton.addEventListener("click", () => dialog.close());
  actions.append(closeButton);
  dialog.className = "activity-image-dialog";
  dialog.append(heading, previous, picture, next, details, actions);

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
  await renderEvent();
  closeButton.focus();
};

/**
 * Open a modal dialog to display a call snapshot image.
 * @param {HTMLElement} host
 * @param {string} callId
 */
export const showCallImageDialog = async (host, callId) => {
  try {
    const image = await host._hass.callWS({
      type: "akuvox/panel_call_image",
      entry_id: host._activeAccount,
      call_id: callId,
    });
    const documentRef = host.shadowRoot.ownerDocument;
    const dialog = documentRef.createElement("dialog");
    const picture = documentRef.createElement("img");
    const close = documentRef.createElement("button");

    dialog.className = "activity-image-dialog";
    picture.src = `data:${image.content_type};base64,${image.data}`;
    picture.alt = "SmartPlus call image";
    close.className = "modal-action";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());

    dialog.append(picture, close);
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
      "The SmartPlus call image could not be retrieved.",
      "Image unavailable"
    );
  }
};
