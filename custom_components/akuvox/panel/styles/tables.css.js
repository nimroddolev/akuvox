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
    color: var(--panel-muted, #6b7280);
  }

  .table-wrap {
    overflow-x: auto;
  }

  .row-view-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .devices-summary {
    margin: 3px 0 0;
    color: var(--panel-muted, var(--secondary-text-color, #6b7280));
    font-size: 13px;
  }

  .view-mode-toggle {
    display: inline-flex;
    flex: 0 0 auto;
    width: fit-content;
    min-height: 36px;
    gap: 0;
    padding: 4px;
    box-sizing: border-box;
    border: 0;
    border-radius: 999px;
    background: #efeded;
  }

  .view-mode-toggle .action {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 4px 7px;
    color: #424a52;
    background: transparent;
    box-shadow: none;
    border-radius: 15px;
    font-size: 13px;
    font-weight: 600;
    gap: 6px;
    white-space: nowrap;
  }

  .view-mode-toggle .action svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }

  .view-mode-toggle .action.active,
  .view-mode-toggle .action[aria-pressed="true"] {
    color: #006b9f;
    background: #fff;
    box-shadow: 0 3px 9px rgb(0 0 0 / 11%);
  }

  .mobile-filter-toggle[aria-expanded="true"] {
    color: #006b9f;
    background: #fff;
    box-shadow: 0 2px 7px rgb(0 0 0 / 12%);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 16px;
    margin-top: 0;
  }

  .tile-card {
    display: grid;
    gap: 16px;
    box-sizing: border-box;
    min-width: 0;
    padding: 18px;
    border: 1px solid var(--panel-outline, var(--divider-color, #8c99a3));
    border-radius: 12px;
    background: var(--panel-card, #fff);
    box-shadow: 0 1px 2px rgb(27 28 28 / 4%);
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }

  .tile-card:hover {
    border-color: color-mix(in srgb, var(--aqua) 45%, var(--panel-outline, #dbe2e8));
    box-shadow: 0 8px 18px rgb(27 28 28 / 8%);
    /* Moving the hover target makes a pointer at its lower edge repeatedly
       leave and re-enter it, causing the device preview to visibly jitter. */
    transform: none;
  }

  .tile-card-heading {
    display: flex;
    align-items: center;
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
    opacity: 1;
    touch-action: none;
    user-select: none;
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
    color: var(--panel-text, inherit);
    font-size: 16px;
    font-weight: 600;
  }

  .tile-card p {
    margin: 5px 0 0;
  }

  .device-tile .tile-actions {
    --device-tile-action-height: 38px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    grid-auto-rows: var(--device-tile-action-height);
    min-height: 38px;
    gap: 8px;
    margin-top: -8px;
  }

  .device-preview {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    background: #e9eef1;
  }

  .device-preview[data-camera-preview-stream] { cursor: pointer; }

  .device-preview img {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
  }

  .device-preview-play {
    position: absolute;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
    padding: 0;
    border: 0 !important;
    border-radius: 999px;
    color: #fff !important;
    background: #03a9f4 !important;
    box-shadow: 0 3px 12px rgb(0 0 0 / 28%);
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease, transform 120ms ease, background 120ms ease;
  }

  .device-preview.loaded .device-preview-play {
    opacity: 1;
    pointer-events: auto;
  }

  .device-preview-play:hover {
    background: #03a9f4;
    transform: scale(1.06);
  }

  .device-preview-play:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }

  .device-preview-play svg {
    width: 50px;
    height: 50px;
    display: block;
    margin: 0;
    transform: translateX(-1px);
    fill: currentColor;
    stroke: none;
  }

  .device-preview.unavailable {
    background: #f1f4f5;
  }

  .device-preview.unavailable::after {
    position: absolute;
    z-index: 1;
    width: 62px;
    height: 3px;
    content: "";
    border-radius: 99px;
    background: #b3261e;
    transform: rotate(-45deg);
  }

  .device-preview-placeholder {
    position: absolute;
    z-index: 0;
    color: var(--panel-muted, #5e6972);
    transition: opacity 120ms ease;
  }

  .device-preview.loaded .device-preview-placeholder {
    opacity: 0;
  }

  .device-preview-placeholder svg {
    width: 28px;
    height: 28px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
  }

  .device-preview.loading .device-preview-placeholder svg,
  .device-preview.unavailable .device-preview-placeholder svg {
    width: 56px;
    height: 56px;
  }

  .device-preview .device-status {
    position: absolute;
    z-index: 4;
    top: 10px;
    left: 10px;
    margin: 0;
  }

  .device-tile .tile-actions > * {
    justify-self: center;
    text-align: center;
  }

  .tile-actions .device-action {
    width: 100%;
    min-width: 0;
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
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .tile-actions .device-action svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .tile-actions .device-monitor-action {
    color: #4b258c;
    background: #f0eaff;
  }

  .tile-actions .device-unlock-action {
    color: #a12828;
    background: #ffebee;
  }

  .device-status {
    display: inline-flex;
    margin: 6px 0 0;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
  }

  .device-status.ready { color: #25723a; background: #e8f5e9; }
  .device-status.loading { color: #53636d; background: #edf1f3; }
  .device-status.unavailable { color: #b3261e; background: #fde8e7; }

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
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 3px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
  }

  .key-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .key-status.active { color: #18733d; background: #e8f5e9; }
  .key-status.expired { color: #ba1a1a; background: #ffdad6; }

  .key-status em {
    margin-left: 2px;
    color: #59656e;
    font-size: 10px;
    font-style: normal;
    font-weight: 500;
  }

  .key-status.active em { color: inherit; }

  .call-status {
    display: inline-block;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .call-status.answered { color: #176b45; background: #d8f4e4; }
  .call-status.missed { color: #9f2d2d; background: #fde0e0; }

  .key-tile {
    gap: 12px;
    padding: 16px;
    border-color: #e0e0e0;
    border-radius: 12px;
    box-shadow: none;
  }

  .key-tile:hover {
    border-color: #e0e0e0;
    box-shadow: 0 4px 16px rgb(0 0 0 / 8%);
    transform: none;
  }

  .key-tile-active { border-color: #62c78c; }
  .key-tile-active:hover { border-color: #62c78c; }

  .key-tile-expired {
    border-color: #e0e0e0;
    background: #f5f3f3;
    opacity: .72;
  }

  .key-tile .tile-card-heading { align-items: flex-start; }

  .key-tile-title-group {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    gap: 4px;
  }

  .key-tile-title-group h3 {
    margin: 0;
    overflow: hidden;
    color: #1b1c1c;
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-tile .tile-grab {
    width: 18px;
    height: 22px;
    color: #6e7882;
    font-size: 18px;
  }

  .key-tile .key-actions { gap: 4px; }

  .key-tile .key-menu-button {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    color: #59656e;
    background: transparent;
    box-shadow: none;
    font-size: 20px;
  }

  .key-tile .key-menu-button.danger { color: #ba1a1a; }

  .key-tile .key-menu-button:hover { background: #efeded; }

  .key-tile-code {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 58px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #f5f3f3;
  }

  .key-tile-code > div {
    display: grid;
    min-width: 0;
    justify-items: center;
    text-align: center;
  }

  .key-tile-code span {
    display: block;
    color: #59656e;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  .key-tile-code strong {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 26px;
    color: #006493;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 20.8px;
    font-weight: 700;
    letter-spacing: .12em;
  }

  .key-tile-code .copy-code {
    width: 34px;
    height: 34px;
    margin-left: 8px;
    border-radius: 8px;
    color: #59656e;
    background: #efeded;
  }

  .key-tile-code .copy-code { border: 1px solid #c7d1dc; }

  .key-tile-code .copy-code .qr-code-icon { stroke-width: 1.35; }

  .key-tile-code .copy-code:hover { color: #fff; background: #006493; }

  .key-tile-code .copied-code {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    line-height: 1;
    color: #18733d;
    font-family: inherit;
    font-size: 13px;
    letter-spacing: 0;
  }

  .key-tile-code .copied-code svg { display: block; }

  .key-tile-validity {
    display: grid;
    gap: 6px;
    margin: 0;
  }

  .key-tile-validity div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .key-tile-validity dt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    color: #6e7882;
    font-size: 12px;
    font-weight: 400;
  }

  .key-tile-validity dt svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .key-tile-validity dd {
    margin: 0;
    color: #1b1c1c;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  .key-tile-usage {
    padding-top: 8px;
    border-top: 1px solid #efeded;
  }

  .key-tile-usage > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #59656e;
    font-size: 11px;
    font-weight: 500;
  }

  .key-tile-usage strong { color: #18733d; font-weight: 600; }

  .key-tile-expired .key-tile-usage strong { color: #59656e; }

  .key-tile-usage > i {
    display: block;
    height: 6px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: #efeded;
  }

  .key-tile-usage b {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #03a9f4;
  }

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

  .activity-timestamp {
    display: grid;
    gap: 2px;
    white-space: nowrap;
  }

  .activity-timestamp time {
    font-weight: 500;
  }

  .activity-timestamp span {
    color: var(--panel-muted, #4b5563);
    font-size: 12px;
    font-weight: 600;
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
    color: #4b258c;
    background: #f0eaff;
  }

  .device-table .device-unlock-action {
    color: #a12828;
    background: #ffebee;
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
    color: var(--navy, var(--aqua));
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

  .mobile-filter-toolbar,
  .mobile-clear-filters {
    display: none;
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

  /* Keep the Sort By menu aligned with the adjacent filter controls. */
  .tile-sort-control > .multi-select-filter {
    min-width: 150px;
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

  @media (max-width: 800px) {
    .mobile-filter-toolbar {
      display: flex;
      margin: 12px 0 0;
    }

    .mobile-filter-toggle,
    .mobile-clear-filters {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      border: 1px solid var(--divider-color, #8c99a3);
      border-radius: 9px;
      color: var(--primary-text-color);
      background: var(--card-background-color, #fff);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .mobile-filter-toggle {
      padding: 7px 12px;
      gap: 6px;
    }

    .mobile-filter-count {
      display: inline-grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: 999px;
      color: #fff;
      background: var(--aqua);
      font-size: 11px;
    }

    .activity-controls.mobile-filter-panel {
      display: none;
      margin: 10px 0 12px;
      padding: 12px;
      border: 1px solid var(--divider-color, #8c99a3);
      border-radius: 10px;
      background: var(--secondary-background-color, #f7f8f9);
    }

    .activity-controls.mobile-filter-panel.mobile-filter-panel-open {
      display: flex;
    }

    .mobile-filter-panel > label,
    .mobile-filter-panel > .multi-select-filter,
    .mobile-filter-panel > .tile-sort-control {
      width: 100%;
      min-width: 0;
    }

    .mobile-filter-panel .key-filter-input,
    .mobile-filter-panel .multi-select-filter-summary {
      width: 100%;
    }

    .mobile-filter-panel .tile-sort-control > .multi-select-filter {
      flex: 1;
      min-width: 0;
    }

    .mobile-clear-filters {
      padding: 7px 12px;
      color: var(--primary-text-color);
    }
  }

  @media (max-width: 600px) {
    .activity-table-wrap {
      margin-inline: -12px;
      border-inline-width: 0;
      border-radius: 0;
    }

    .row-view-heading {
      align-items: flex-start;
    }

    .view-mode-toggle .action {
      min-height: 32px;
      padding-inline: 10px;
    }

    .device-tile-grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .device-tile {
      padding: 16px;
    }

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
    .device-table .info-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .device-table .info-link span { display: none; }

    .tile-details { grid-template-columns: 1fr; }

  }
  /* Physical offsets in tiles and tables must be mirrored for RTL locales. */
  :host([dir="rtl"]) .table-wrap table th,
  :host([dir="rtl"]) .table-wrap table td { text-align: right; }
  :host([dir="rtl"]) .tile-status,
  :host([dir="rtl"]) .device-preview-status { left: auto; right: 10px; }
  :host([dir="rtl"]) .tile-menu,
  :host([dir="rtl"]) .key-menu-button { right: auto; left: 11px; }
  :host([dir="rtl"]) .tile-grab,
  :host([dir="rtl"]) .list-grab { margin-left: 0; margin-right: 2px; }
  :host([dir="rtl"]) .tile-meta-icon { margin-left: 0; margin-right: 8px; }
`;
