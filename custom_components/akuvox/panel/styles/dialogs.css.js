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
    width: min(700px, calc(100vw - 32px));
  }

  .range-mode-group {
    margin: 12px 0;
    padding: 12px;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 10px;
  }

  .range-mode-group.selected {
    border-color: var(--aqua, #55bfe6);
    background: color-mix(in srgb, var(--aqua, #55bfe6) 8%, transparent);
  }

  .range-mode-title {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .relative-range-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
  }

  .relative-range-controls .relative-range-input {
    box-sizing: border-box;
    width: auto;
    min-width: 88px;
    padding: 8px;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 8px;
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
    width: min(100%, 420px);
    margin: auto;
    justify-content: center;
  }

  @media (max-width: 500px) {
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
`;
