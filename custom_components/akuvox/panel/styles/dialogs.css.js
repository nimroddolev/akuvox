/**
 * Styles for modal dialogs, date range picker, and page blocker overlay.
 */

export const dialogStyles = `
  dialog {
    border: 0;
    border-radius: 14px;
    padding: 24px;
    width: min(560px, calc(100vw - 48px));
    color: inherit;
    background: var(--card-background-color, #fff);
    text-align: center;
  }

  dialog::backdrop {
    background: #003b5c99;
  }

  dialog form {
    justify-items: center;
  }

  dialog form > label {
    width: min(100%, 420px);
    text-align: center;
  }

  dialog form > .share-link-input-wrap {
    width: 100%;
    justify-self: stretch;
  }

  dialog form input,
  dialog form select {
    text-align: center;
  }

  dialog fieldset {
    width: min(100%, 420px);
    text-align: center;
    justify-items: center;
  }

  dialog .relay-options {
    display: grid;
    justify-items: start;
    width: fit-content;
    max-width: 100%;
    margin: auto;
  }

  dialog .check {
    text-align: left;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 16px;
  }

  .modal-action,
  .modal-cancel {
    min-width: 112px;
    height: 40px;
    border: 0;
    border-radius: 8px;
    font: inherit;
    cursor: pointer;
  }

  .modal-action {
    color: white;
    background: #55bfe6;
  }

  .modal-action:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .modal-cancel {
    color: #fff;
    background: #4b5563;
  }

  .modal-cancel:hover {
    background: #374151;
  }

  .modal-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .modal-icon svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  /* Date Range Picker */
  .date-range-field {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 8px;
    padding: 8px;
    color: inherit;
    background: var(--card-background-color, #fff);
    text-align: left;
  }

  .date-range-field::before {
    width: 18px;
    content: "";
  }

  .date-range-field [data-validity-label] {
    text-align: center;
  }

  .date-range-field svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .range-dialog {
    display: flex;
    flex-direction: column;
    width: min(640px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow: hidden;
    text-align: left;
  }

  dialog.range-dialog > .range-dialog-header {
    display: flex;
    box-sizing: border-box;
    min-height: 112px;
    align-items: center;
    gap: 14px;
    padding: 24px 30px;
    border: 0;
    border-bottom: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8));
    border-radius: 0;
    color: inherit;
    background: transparent;
  }

  .range-dialog-icon {
    display: grid;
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--aqua) 24%, transparent);
    border-radius: 12px;
    color: var(--aqua);
    background: color-mix(in srgb, var(--aqua) 9%, transparent);
  }

  .range-dialog-icon svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; }

  .range-dialog-header h2 { margin: 0; font-size: 23px; line-height: 1.25; }
  .range-dialog-header p { margin: 4px 0 0; color: var(--panel-muted, var(--secondary-text-color)); line-height: 1.45; }

  .range-dialog-close {
    width: 34px;
    height: 34px;
    margin-left: auto;
    padding: 0;
    border: 0;
    color: var(--panel-muted, var(--secondary-text-color));
    background: transparent;
    font-size: 29px;
    font-weight: 300;
    line-height: 1;
  }

  .range-dialog-body {
    min-height: 0;
    flex: 1 1 auto;
    padding: 22px 30px 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  dialog.range-dialog .range-mode-options {
    box-sizing: border-box;
    width: 100%;
    max-width: none;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    text-align: left;
  }

  .range-mode-group {
    box-sizing: border-box;
    width: 100%;
    margin: 0 0 14px;
    padding: 16px 18px;
    border: 1px solid var(--panel-outline, var(--divider-color, #bbb));
    border-radius: 14px;
    background: var(--card-background-color, #fff);
    box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
  }

  .range-mode-group.selected {
    border-color: var(--aqua, #55bfe6);
    background: color-mix(in srgb, var(--aqua, #55bfe6) 8%, transparent);
  }

  .range-mode-title {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    cursor: pointer;
  }

  .range-mode-title input { width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--aqua); }
  .range-mode-title strong { display: block; font-size: 16px; }
  .range-mode-title small { display: block; margin-top: 3px; color: var(--panel-muted, var(--secondary-text-color)); font-size: 14px; font-weight: 400; line-height: 1.45; }

  .relative-range-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
  }

  .relative-range-controls .relative-range-input {
    box-sizing: border-box;
    width: auto;
    min-width: 88px;
    padding: 8px;
    border: 1px solid var(--panel-outline, var(--divider-color, #bbb));
    border-radius: 10px;
    color: inherit;
    background: var(--card-background-color, #fff);
  }

  .range-calendar-wrap {
    width: min(70%, 490px);
    margin: 12px auto 0;
  }

  .range-calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: center;
  }

  .range-calendar-header button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    font-size: 22px;
  }

  .range-calendar {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin: 12px 0;
    grid-auto-rows: 38px;
    min-height: 190px;
  }

  .range-calendar .weekday {
    padding: 4px;
    color: var(--secondary-text-color, #6b7280);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }

  .range-calendar .day {
    height: 38px;
    min-width: 32px;
    border: 0;
    border-radius: 7px;
    color: inherit;
    background: transparent;
  }

  .range-calendar .day:hover {
    background:rgb(162, 228, 248);
    color: #17212b;
  }

  .range-calendar .day.selected {
    color: white;
    background:rgb(20, 184, 244);
  }

  .range-calendar .day.in-range {
    color: #17212b;
    background:rgb(126, 220, 249);
  }

  .range-calendar .day.empty {
    visibility: hidden;
  }

  .range-calendar .day.unavailable,
  .range-calendar .day:disabled {
    color: var(--disabled-text-color, #8b8b8b);
    cursor: not-allowed;
    opacity: .65;
  }

  .range-calendar .day:disabled:hover {
    color: var(--disabled-text-color, #8b8b8b);
    background: transparent;
  }

  .range-times {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    width: auto;
    margin: 16px 0 0;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--panel-outline, #dbe2e8) 70%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel-surface, #fbf9f9) 70%, transparent);
  }

  .range-times label { display: grid; gap: 6px; color: var(--panel-muted, var(--secondary-text-color)); font-size: 13px; font-weight: 600; }
  .range-times input { min-height: 42px; box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid var(--panel-outline, var(--divider-color, #bbb)); border-radius: 9px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font: inherit; }

  .range-dialog .modal-actions {
    flex: 0 0 auto;
    justify-content: flex-end;
    margin: 22px 0 0;
    padding: 20px 30px;
    border-top: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8));
    background: color-mix(in srgb, var(--panel-surface, #fbf9f9) 55%, transparent);
  }

  /* Create temporary key dialog */
  dialog.key-create-dialog[open] {
    display: flex;
    flex-direction: column;
    width: min(540px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow: hidden;
    text-align: left;
  }

  .key-create-dialog-header {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 32px;
    flex: 0 0 auto;
    align-items: flex-start;
    gap: 12px;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8));
    position: relative;
    z-index: 1;
    isolation: isolate;
    background: var(--card-background-color, #fff);
  }
  .key-create-dialog-header > div { min-width: 0; }
  .key-create-dialog-icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; color: var(--aqua, #03a9f4); }
  .key-create-dialog-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; }
  .key-create-dialog-header h2 { margin: 2px 0 3px; font-size: 20px; line-height: 1.25; }
  .key-create-dialog-header p { margin: 0; color: var(--panel-muted, var(--secondary-text-color)); font-size: 13px; line-height: 1.45; }
  .key-create-dialog-close { box-sizing: border-box; width: 32px; min-width: 32px; height: 32px; min-height: 32px; flex: 0 0 32px; aspect-ratio: 1; margin: -5px -5px 0 auto; padding: 0; border: 0; border-radius: 50%; color: var(--panel-muted, var(--secondary-text-color)); background: transparent; font: inherit; font-size: 27px; line-height: 1; }
  .key-create-dialog-close:hover { color: var(--panel-text, inherit); background: color-mix(in srgb, currentColor 9%, transparent); }

  dialog.key-create-dialog .key-create-form { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; align-items: stretch; }
  dialog.key-create-dialog .key-create-dialog-body { display: grid; align-self: stretch; box-sizing: border-box; width: 100%; min-width: 0; min-height: 0; flex: 1 1 auto; gap: 16px; padding: 20px 24px; overflow-y: auto; overscroll-behavior: contain; }
  dialog.key-create-dialog .key-create-dialog-body > * { box-sizing: border-box; width: 100%; min-width: 0; }
  dialog.key-create-dialog .key-create-field { display: grid; grid-template-columns: 1fr; align-items: stretch; width: 100%; gap: 6px; margin: 0; font-weight: 400; }
  .key-create-field > span, .key-relay-heading > span { color: var(--panel-text, inherit); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .key-create-field input:not([type="hidden"]) { box-sizing: border-box; width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 8px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font: inherit; text-align: left; }
  .key-create-field input:focus { outline: 2px solid color-mix(in srgb, var(--aqua, #03a9f4) 35%, transparent); outline-offset: 1px; border-color: var(--aqua, #03a9f4); }
  .key-create-field small, .key-relay-heading small { color: var(--panel-muted, var(--secondary-text-color)); font-size: 12px; line-height: 1.4; }

  /* Edit temporary key uses the same dialog frame and field treatment as creation,
     while clearly separating values that cannot be changed after issuance. */
  .key-edit-readonly-fields { display: grid; gap: 10px; }
  .key-readonly-field { display: grid; gap: 5px; padding: 11px 12px; border: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); border-radius: 8px; background: color-mix(in srgb, var(--panel-surface, #f8fafc) 55%, transparent); }
  .key-readonly-field > span { color: var(--panel-muted, var(--secondary-text-color)); font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .key-readonly-field > strong { color: var(--panel-text, inherit); font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
  .key-use-stepper { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; width: min(100%, 240px); overflow: hidden; border: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 9px; background: var(--card-background-color, #fff); }
  .key-use-stepper button { display: grid; min-height: 42px; place-items: center; padding: 0; border: 0; color: var(--panel-muted, var(--secondary-text-color)); background: color-mix(in srgb, var(--panel-surface, #f8fafc) 72%, transparent); font: inherit; font-size: 26px; line-height: 1; user-select: none; -webkit-user-select: none; }
  .key-use-stepper button:hover { color: var(--aqua, #03a9f4); background: color-mix(in srgb, var(--aqua, #03a9f4) 9%, transparent); }
  .key-use-stepper button + input { border-inline: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)) !important; border-block: 0 !important; border-radius: 0 !important; text-align: center !important; font-weight: 600; -moz-appearance: textfield; }
  .key-use-stepper input::-webkit-inner-spin-button, .key-use-stepper input::-webkit-outer-spin-button { margin: 0; -webkit-appearance: none; }
  .key-use-stepper svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; }

  dialog.key-create-dialog .date-range-field { grid-template-columns: 18px minmax(0, 1fr); min-height: 42px; padding: 9px 12px; border-color: var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 8px; font-weight: 600; }
  dialog.key-create-dialog .date-range-field::before { display: none; }
  dialog.key-create-dialog .date-range-field [data-validity-label] { text-align: left; }

  .key-optional-identifiers { box-sizing: border-box; border: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); border-radius: 10px; overflow: visible; }
  .key-optional-identifiers summary { display: flex; align-items: center; box-sizing: border-box; min-height: 48px; padding: 12px 14px; color: var(--panel-text, inherit); background: color-mix(in srgb, var(--panel-surface, #f8fafc) 70%, transparent); cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: .04em; line-height: 1.25; text-transform: uppercase; }
  .key-optional-identifiers summary::before { width: 14px; flex: 0 0 14px; content: "▸"; font-size: 15px; line-height: 1; transition: transform 150ms ease; }
  .key-optional-identifiers:not([open]) .key-form-extra-fields { display: none !important; }
  .key-optional-identifiers[open] summary { border-bottom: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); }
  .key-optional-identifiers[open] summary::before { transform: rotate(90deg); }
  .key-form-extra-fields { display: grid; gap: 12px; padding: 14px; border-top: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); }
  dialog.key-create-dialog .key-form-extra-fields > label { display: grid; grid-template-columns: 1fr; align-items: stretch; width: 100%; gap: 6px; margin: 0; color: var(--panel-muted, var(--secondary-text-color)); font-size: 12px; font-weight: 600; }
  .key-form-extra-fields input { box-sizing: border-box; width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--panel-outline, var(--divider-color, #cbd5e1)); border-radius: 7px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font: inherit; text-align: left; }

  dialog.key-create-dialog .key-create-form .key-relay-row { display: grid; grid-template-columns: 1fr; align-items: stretch; width: auto; gap: 10px; margin: 0; padding: 14px; border: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); border-radius: 10px; background: color-mix(in srgb, var(--panel-surface, #f8fafc) 55%, transparent); }
  .key-relay-heading { display: grid; gap: 3px; }
  dialog.key-create-dialog .relay-options { display: grid; width: 100%; max-width: none; gap: 8px; margin: 0; }
  .key-create-form .relay-options .check { display: flex; align-items: center; gap: 10px; box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--panel-outline, var(--divider-color, #dbe2e8)); border-radius: 8px; color: var(--panel-text, inherit); background: var(--card-background-color, #fff); font-size: 14px; font-weight: 600; }
  .key-create-form .relay-options .check:focus-within { border-color: var(--aqua, #03a9f4); }
  .key-create-form .relay-options input { width: 16px; height: 16px; margin: 0; accent-color: var(--aqua, #03a9f4); }

  dialog.key-create-dialog .key-create-form > .modal-actions { display: flex; flex: 0 0 auto; justify-content: flex-end; box-sizing: border-box; width: 100%; margin: 0; padding: 14px 24px; border: 0; background: transparent; }
  .key-create-dialog .modal-action, .key-create-dialog .modal-cancel { min-width: 108px; }

  @media (max-width: 500px) {
    .key-create-dialog-header, .key-create-dialog-body, .key-create-dialog .modal-actions { padding-left: 18px; padding-right: 18px; }
    .key-create-dialog-header { min-height: 112px; padding-top: 16px; padding-bottom: 14px; }
    .key-create-dialog-header h2 { margin-top: 0; }
  }

  @media (max-width: 500px) {
    .range-dialog-header,
    .range-dialog-body,
    .range-dialog .modal-actions { padding-left: 18px; padding-right: 18px; }

    .range-times {
      grid-template-columns: 1fr;
    }
  }

  /* Page Blocker Spinner */
  .page-blocker {
    position: fixed;
    z-index: 10000;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    pointer-events: auto;
    transition: opacity 180ms ease;
  }

  .page-blocker::before {
    position: absolute;
    inset: 0;
    background: #0004;
    content: "";
  }

  .page-blocker.visible {
    opacity: 1;
  }

  .page-blocker-spinner {
    position: relative;
    width: 44px;
    height: 44px;
    border: 5px solid #ffffff66;
    border-top-color: #fff;
    border-radius: 50%;
    animation: page-blocker-spin 0.8s linear infinite;
  }

  @keyframes page-blocker-spin {
    to {
      transform: rotate(360deg);
    }
  }
  :host([dir="rtl"]) dialog,
  :host([dir="rtl"]) dialog .modal-body,
  :host([dir="rtl"]) dialog .modal-content,
  :host([dir="rtl"]) dialog .key-create-dialog-body { text-align: right; }
  :host([dir="rtl"]) dialog .modal-actions { margin-left: 0; margin-right: auto; }
  :host([dir="rtl"]) dialog.door-notification-dialog .modal-actions {
    box-sizing: border-box;
    width: 100%;
    margin-inline: 0;
    justify-content: center;
  }
  :host([dir="rtl"]) .key-create-field input:not([type="hidden"]),
  :host([dir="rtl"]) .key-form-extra-fields input,
  :host([dir="rtl"]) dialog.key-create-dialog .date-range-field [data-validity-label] { text-align: right; }
  :host([dir="rtl"]) input[type="number"],
  :host([dir="rtl"]) input[name="code"],
  :host([dir="rtl"]) input[name="passcode"] { direction: ltr; text-align: left; }

`;
