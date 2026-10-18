/**
 * Shared building blocks for the panel's multi-step dialogs.
 */

import { escapeHtml } from "../utils/dom.js";

/** Render the discrete progress indicator used by every setup wizard. */
export const wizardProgress = ({ label, totalStages, stage, attribute }) => `<div class="wizard-stage-progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="${totalStages}" aria-valuenow="${stage}" ${attribute}>
  ${Array.from({ length: totalStages }, (_, index) => `<span data-wizard-stage="${index + 1}"${index < stage ? " class=\"is-complete\"" : ""}></span>`).join("")}
</div>`;

/** Update a wizard's progress indicator without rebuilding the dialog. */
export const setWizardProgress = (dialog, selector, stage) => {
  const progress = dialog.querySelector(selector);
  if (!progress) return;
  const completedStages = Math.max(0, Number(stage) || 0);
  progress.querySelectorAll("[data-wizard-stage]").forEach((segment) => {
    segment.classList.toggle("is-complete", Number(segment.dataset.wizardStage) <= completedStages);
  });
  progress.setAttribute("aria-valuenow", String(completedStages));
};

/**
 * Change a wizard step while smoothly resizing its dialog to the new content.
 * The fixed pixel height is removed once the transition is complete so dialogs
 * continue to fit responsive content and browser zoom changes.
 */
export const animateWizardHeight = (dialog, update) => {
  const startHeight = dialog.getBoundingClientRect().height;
  dialog.style.height = `${startHeight}px`;
  update();
  const endHeight = dialog.scrollHeight;
  if (Math.abs(endHeight - startHeight) < 1) {
    dialog.style.height = "";
    return;
  }
  requestAnimationFrame(() => {
    dialog.style.height = `${endHeight}px`;
    dialog.addEventListener("transitionend", (event) => {
      if (event.propertyName === "height") dialog.style.height = "";
    }, { once: true });
  });
};
