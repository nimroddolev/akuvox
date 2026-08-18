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
    padding: 10px;
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
