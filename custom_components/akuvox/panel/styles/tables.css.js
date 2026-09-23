/**
 * Styles for data tables, sort buttons, and table filter controls.
 */

export const tableStyles = `
  table {
    width: 100%;
    border-collapse: collapse;
    overflow: auto;
  }

  th,
  td {
    padding: 6px;
    text-align: left;
    border-bottom: 1px solid var(--divider-color, #ddd);
    vertical-align: middle;
  }

  th {
    color: var(--secondary-text-color, #6b7280);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .row-view-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .view-mode-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
  }

  .view-mode-toggle .action {
    min-height: 32px;
    padding: 5px 10px;
    color: var(--primary-text-color);
    background: transparent;
    box-shadow: none;
  }

  .view-mode-toggle .action.active,
  .view-mode-toggle .action[aria-pressed="true"] {
    color: var(--text-primary-color, #fff);
    background: var(--aqua);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  .tile-card {
    display: grid;
    gap: 14px;
    box-sizing: border-box;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 12px;
    background: var(--card-background-color, #fff);
  }

  .tile-card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .tile-title {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .tile-grab {
    width: 22px;
    height: 30px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--secondary-text-color, #6b7280);
    background: transparent;
    cursor: grab;
    font-size: 21px;
    line-height: 1;
    opacity: 0;
    touch-action: none;
    user-select: none;
  }

  .tile-card:hover .tile-grab,
  .tile-card:focus-within .tile-grab,
  .tile-grab:focus-visible {
    opacity: 1;
  }

  .tile-grab:hover,
  .tile-grab:focus-visible {
    color: var(--aqua);
    background: color-mix(in srgb, var(--aqua) 14%, transparent);
  }

  .tile-grab:active { cursor: grabbing; }

  .list-title {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .list-grab {
    width: 24px;
    min-height: 30px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--secondary-text-color, #6b7280);
    background: transparent;
    cursor: grab;
    font-size: 21px;
    line-height: 1;
    touch-action: none;
    user-select: none;
  }

  .list-grab:hover,
  .list-grab:focus-visible {
    color: var(--aqua);
    background: color-mix(in srgb, var(--aqua) 14%, transparent);
  }

  .list-grab:active { cursor: grabbing; }

  .list-dragging { opacity: 0.35; }

  .list-drop-target td { box-shadow: inset 0 2px 0 var(--aqua); }

  .list-drop-target.list-drop-after td { box-shadow: inset 0 -2px 0 var(--aqua); }

  .list-drag-preview {
    position: fixed;
    z-index: 10002;
    margin: 0;
    border-collapse: collapse;
    pointer-events: none;
    opacity: 0.92;
    cursor: grabbing;
    background: transparent;
    box-shadow: 0 16px 32px rgb(0 0 0 / 24%);
    transform: rotate(1deg) scale(1.02);
    transition: none;
  }


  .tile-dragging {
    opacity: 0.2;
    outline: 2px dashed var(--aqua);
    outline-offset: 2px;
  }

  .tile-drop-target {
    outline: 2px solid var(--aqua);
    outline-offset: 2px;
  }

  .tile-drag-preview {
    position: fixed;
    z-index: 10002;
    margin: 0;
    pointer-events: none;
    opacity: 0.92;
    cursor: grabbing;
    box-shadow: 0 16px 32px rgb(0 0 0 / 24%);
    transform: rotate(1deg) scale(1.02);
    transition: none;
  }

  .tile-card h3 {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 17px;
  }

  .tile-card p {
    margin: 5px 0 0;
  }

  .device-tile .tile-actions {
    --device-tile-action-height: 56px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    grid-auto-rows: var(--device-tile-action-height);
    min-height: 48px;
    gap: 8px;
  }

  .device-tile .tile-actions > * {
    justify-self: center;
    text-align: center;
  }

  .tile-actions .device-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }

  .device-tile .tile-actions .device-action {
    box-sizing: border-box;
    align-self: stretch;
    min-height: var(--device-tile-action-height);
    height: var(--device-tile-action-height);
  }

  .tile-actions .device-action svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .tile-actions .device-monitor-action {
    background: linear-gradient(135deg, #7550e8, #9b5cf2);
  }

  .tile-actions .device-unlock-action {
    background: linear-gradient(135deg, #ff3f3f, #ff6a4f);
  }

  .tile-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
  }

  .tile-details div { min-width: 0; }

  .tile-details dt {
    margin-bottom: 4px;
    color: var(--secondary-text-color, #6b7280);
    font-size: 12px;
    font-weight: 600;
  }

  .tile-details dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .key-status {
    display: inline-block;
    margin-top: 6px;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .key-status.active { color: #176b45; background: #d8f4e4; }
  .key-status.expired { color: #9f2d2d; background: #fde0e0; }

  .call-status {
    display: inline-block;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .call-status.answered { color: #176b45; background: #d8f4e4; }
  .call-status.missed { color: #9f2d2d; background: #fde0e0; }

  .key-tile-active { border-color: #62c78c; }
  .key-tile-expired { border-color: #e56b6b; }

  .key-tile-select {
    width: 18px;
    height: 18px;
    accent-color: var(--aqua);
  }

  .activity-updated {
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }

  /* Devices Table */
  .device-table {
    table-layout: auto;
  }

  .device-table th:first-child,
  .device-table td:first-child {
    width: 1%;
    white-space: nowrap;
  }

  .device-table th:nth-child(2),
  .device-table th:nth-child(3),
  .device-table th:nth-child(4) {
    width: auto;
  }

  .device-table th:nth-child(n+2),
  .device-table td:nth-child(n+2) {
    text-align: center;
  }

  .device-table td {
    overflow-wrap: anywhere;
  }

  .device-table .actions {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .device-table .action {
    width: 104px;
    max-width: 100%;
    white-space: nowrap;
  }

  .device-table .device-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }

  .device-table .device-monitor-action {
    background: linear-gradient(135deg, #7550e8, #9b5cf2);
  }

  .device-table .device-unlock-action {
    background: linear-gradient(135deg, #ff3f3f, #ff6a4f);
  }

  .device-table .device-action svg {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .info-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--aqua);
    text-decoration: none;
    font-weight: 600;
  }

  .info-link svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  /* Filter Controls */
  .activity-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0;
  }

  .activity-controls:has(.multi-select-filter[open]) {
    position: relative;
    z-index: 10;
  }

  .table-wrap:has(.multi-select-filter[open]) {
    overflow: visible;
  }

  .activity-controls label {
    display: grid;
    gap: 3px;
    font-size: 12px;
    font-weight: 600;
  }

  .tile-sort-control {
    display: flex;
    align-items: end;
    gap: 6px;
  }

  .tile-sort-direction {
    width: 36px;
    min-width: 36px;
    min-height: 36px;
    padding: 0;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 8px;
    color: var(--primary-text-color);
    background: var(--card-background-color, #fff);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }

  .tile-sort-direction:focus-visible {
    outline: 2px solid var(--aqua);
    outline-offset: 2px;
  }

  .tile-sort-direction:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .activity-controls select {
    min-width: 130px;
    min-height: 36px;
    padding: 7px 34px 7px 10px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
    color: inherit;
    background: var(--card-background-color, #fff);
    font: inherit;
  }

  .activity-controls select:focus {
    outline: 2px solid var(--aqua);
    outline-offset: 2px;
  }

  .multi-select-filter {
    position: relative;
    min-width: 150px;
  }

  .multi-select-filter[open] { z-index: 11; }

  .multi-select-filter summary {
    display: grid;
    gap: 3px;
    cursor: pointer;
    list-style: none;
    color: inherit;
    font-size: 12px;
    font-weight: 600;
  }

  .multi-select-filter summary::-webkit-details-marker { display: none; }

  .multi-select-filter-summary {
    display: flex;
    align-items: center;
    min-height: 36px;
    box-sizing: border-box;
    padding: 7px 30px 7px 10px;
    overflow: hidden;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
    background: var(--card-background-color, #fff);
    font: inherit;
    font-size: 14px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .multi-select-filter summary:focus-visible .multi-select-filter-summary {
    outline: 2px solid var(--aqua);
    outline-offset: 2px;
  }

  .multi-select-filter summary::after {
    position: absolute;
    right: 11px;
    bottom: 12px;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    padding: 3px;
    content: "";
    transform: rotate(45deg);
  }

  .multi-select-filter[open] summary::after {
    bottom: 9px;
    transform: rotate(225deg);
  }

  .multi-select-filter-options {
    position: absolute;
    z-index: 12;
    top: calc(100% + 4px);
    left: 0;
    display: grid;
    min-width: 100%;
    max-width: min(300px, calc(100vw - 48px));
    max-height: 260px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
    background: var(--card-background-color, #fff);
    box-shadow: 0 4px 12px rgb(0 0 0 / 18%);
  }

  .multi-select-filter-options label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 400;
    white-space: nowrap;
  }

  .multi-select-filter-options label:hover {
    background: color-mix(in srgb, var(--aqua) 14%, transparent);
  }

  .multi-select-filter-options input { accent-color: var(--aqua); }

  /* Sort buttons */
  .sort-button {
    border: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    font-weight: 700;
  }

  .sort-button::after {
    content: " ↕";
    color: var(--secondary-text-color, #6b7280);
  }

  .sort-button.active::after {
    content: " " attr(data-direction);
    color: var(--aqua);
  }

  @media (max-width: 760px) {
    .device-table .actions {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: center;
    }
  }

  @media (max-width: 600px) {
    .device-table th,
    .device-table td {
      padding: 8px 5px;
      font-size: 13px;
    }
    .device-table .action {
      width: 100%;
      font-size: 12px;
      padding: 8px 4px;
    }

    .tile-details { grid-template-columns: 1fr; }
  }
`;
