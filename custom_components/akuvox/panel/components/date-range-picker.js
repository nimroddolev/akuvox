/** Interactive Date Range & Time Picker modal component. */

import { closeOnBackdrop } from "../utils/dom.js";
import { toIsoDateString } from "../utils/formatters.js";
import { showNotice } from "./dialogs.js";

const pad = (value) => String(value).padStart(2, "0");
const describeDuration = (count, unit) => {
  const label = unit.toLowerCase().replace(/s$/, "");
  return `${count} ${label}${count === 1 ? "" : "s"}`;
};
const formatRangeDate = (date, includeYear) => date.toLocaleDateString(undefined, {
  day: "2-digit", month: "2-digit", ...(includeYear ? { year: "numeric" } : {}),
});

/** Open the date range and time picker dialog. */
export const showDateRangePicker = (host, targetForm, labelSelector = "[data-validity-label]", onValidityChanged) => {
  const form = targetForm;
  const beginInput = form.querySelector('[name="begin_time"]');
  const endInput = form.querySelector('[name="end_time"]');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let mode = "";
  let start = beginInput.value ? new Date(beginInput.value) : null;
  let end = endInput.value ? new Date(endInput.value) : null;
  let month = new Date((start || today).getFullYear(), (start || today).getMonth(), 1);
  let amount = 1;
  let unit = "day";
  let startTime = beginInput.value.slice(11, 16) || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let endTime = endInput.value.slice(11, 16) || "23:59";
  const dialog = host.shadowRoot.ownerDocument.createElement("dialog");
  dialog.className = "range-dialog";

  const render = () => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span class="weekday">${day}</span>`).join("");
    const cells = firstDay + dayCount;
    const blanks = Array.from({ length: firstDay }, () => '<span class="day empty"></span>').join("");
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
      const disabled = date < today;
      const selected = start && (toIsoDateString(date) === toIsoDateString(start) || (end && toIsoDateString(date) === toIsoDateString(end)));
      const inRange = start && end && date > start && date < end;
      return `<button type="button" class="day${selected ? " selected" : ""}${inRange ? " in-range" : ""}${disabled ? " unavailable" : ""}" data-range-day="${toIsoDateString(date)}" ${disabled ? "disabled" : ""}>${index + 1}</button>`;
    }).join("");
    const fillers = Array.from({ length: Math.max(0, 35 - cells) }, () => '<span class="day empty"></span>').join("");
    const calendar = `<div class="range-calendar-wrap"><div class="range-calendar-header"><button type="button" data-range-month="-1" aria-label="Previous month">‹</button><strong>${month.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" data-range-month="1" aria-label="Next month">›</button></div><div class="range-calendar">${weekdays}${blanks}${days}${fillers}</div></div>`;
    const suffix = Number(amount) === 1 ? "" : "s";
    const relativeContent = mode === "relative" ? `<div class="relative-range-controls"><span>Enable access for</span><input class="relative-range-input" data-relative-amount type="number" min="0" max="1000" step="1" inputmode="numeric" value="${amount}" aria-label="Duration amount"><select class="relative-range-input" data-relative-unit aria-label="Duration unit"><option value="day" ${unit === "day" ? "selected" : ""}>day${unit === "day" ? suffix : "s"}</option><option value="week" ${unit === "week" ? "selected" : ""}>week${unit === "week" ? suffix : "s"}</option><option value="month" ${unit === "month" ? "selected" : ""}>month${unit === "month" ? suffix : "s"}</option></select><span>starting from today</span></div>` : "";
    const absoluteContent = mode === "absolute" ? calendar : "";
    dialog.innerHTML = `<h2>Select validity period</h2><div class="range-mode-group ${mode === "relative" ? "selected" : ""}"><label class="range-mode-title"><input type="radio" name="range-mode" value="relative" ${mode === "relative" ? "checked" : ""}> <strong>Relative Range</strong></label>${relativeContent}</div><div class="range-mode-group ${mode === "absolute" ? "selected" : ""}"><label class="range-mode-title"><input type="radio" name="range-mode" value="absolute" ${mode === "absolute" ? "checked" : ""}> <strong>Absolute Range</strong></label>${absoluteContent}</div><div class="range-times"><label>Start time <input data-range-start-time type="time" value="${startTime}"></label><label>End time <input data-range-end-time type="time" value="${endTime}"></label></div><div class="modal-actions"><button type="button" class="modal-cancel" data-range-cancel>Cancel</button><button type="button" class="modal-action" data-range-apply>Apply</button></div>`;
    dialog.querySelectorAll('[name="range-mode"]').forEach((radio) => radio.addEventListener("change", () => { mode = radio.value; if (mode === "relative") { start = new Date(today); end = null; } render(); }));
    dialog.querySelector("[data-relative-amount]")?.addEventListener("input", (event) => {
      amount = event.target.value;
      const suffix = Number(amount) === 1 ? "" : "s";
      dialog.querySelectorAll("[data-relative-unit] option").forEach((option) => { option.textContent = `${option.value}${suffix}`; });
    });
    dialog.querySelector("[data-relative-unit]")?.addEventListener("change", (event) => { unit = event.target.value; });
    dialog.querySelector("[data-range-start-time]").addEventListener("input", (event) => { startTime = event.target.value; });
    dialog.querySelector("[data-range-end-time]").addEventListener("input", (event) => { endTime = event.target.value; });
    dialog.querySelectorAll("[data-range-month]").forEach((button) => button.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + Number(button.dataset.rangeMonth), 1); render(); }));
    dialog.querySelectorAll("[data-range-day]").forEach((button) => button.addEventListener("click", () => {
      const chosen = new Date(`${button.dataset.rangeDay}T00:00:00`);
      if (!start || end) {
        start = chosen;
        end = null;
      } else if (chosen < start) {
        end = start;
        start = chosen;
      } else {
        end = chosen;
      }
      render();
    }));
    dialog.querySelector("[data-range-cancel]").addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-range-apply]").addEventListener("click", () => {
      if (!mode) { showNotice(host, "Choose either a relative or absolute range.", "Select a range type"); return; }
      let selectedStart; let selectedEnd; let duration;
      if (mode === "relative") {
        const count = Number(amount);
        if (!Number.isInteger(count) || count < 0 || count > 1000) { showNotice(host, "Enter a whole number from 0 to 1000.", "Check duration"); return; }
        selectedStart = new Date(`${toIsoDateString(today)}T${startTime}`);
        selectedEnd = new Date(selectedStart);
        if (unit === "day") selectedEnd.setDate(selectedEnd.getDate() + count);
        else if (unit === "week") selectedEnd.setDate(selectedEnd.getDate() + count * 7);
        else selectedEnd.setMonth(selectedEnd.getMonth() + count);
        selectedEnd.setHours(Number(endTime.slice(0, 2)), Number(endTime.slice(3, 5)), 0, 0);
        duration = describeDuration(count, unit);
      } else {
        if (!start || !end) { showNotice(host, "Choose a start date, then an end date.", "Select a date range"); return; }
        selectedStart = new Date(`${toIsoDateString(start)}T${startTime}`);
        selectedEnd = new Date(`${toIsoDateString(end)}T${endTime}`);
        const days = Math.max(1, Math.round((new Date(toIsoDateString(end)) - new Date(toIsoDateString(start))) / 86400000));
        duration = describeDuration(days, "Days");
      }
      if (selectedStart <= now) { showNotice(host, "The start date and time must be later than the current time.", "Choose a later start"); return; }
      if (selectedEnd <= selectedStart) { showNotice(host, "The end of the validity period must be after the start time.", "Choose a later end time"); return; }
      beginInput.value = `${toIsoDateString(selectedStart)}T${pad(selectedStart.getHours())}:${pad(selectedStart.getMinutes())}`;
      endInput.value = `${toIsoDateString(selectedEnd)}T${pad(selectedEnd.getHours())}:${pad(selectedEnd.getMinutes())}`;
      form.dataset.validityDuration = duration;
      const labelEl = form.querySelector(labelSelector);
      if (labelEl) {
        const includeYear = selectedStart.getFullYear() !== now.getFullYear() || selectedEnd.getFullYear() !== now.getFullYear();
        labelEl.textContent = `${formatRangeDate(selectedStart, includeYear)} ${beginInput.value.slice(11, 16)} – ${formatRangeDate(selectedEnd, includeYear)} ${endInput.value.slice(11, 16)} (${duration})`;
      }
      onValidityChanged?.(); dialog.close();
    });
  };
  render(); closeOnBackdrop(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  host.shadowRoot.append(dialog); dialog.showModal();
};
