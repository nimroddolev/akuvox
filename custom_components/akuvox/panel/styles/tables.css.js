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
  }
`;
