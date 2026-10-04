/**
 * View-specific styling: Activity thumbnails, Secret inputs, Key management, Help page.
 */

export const viewStyles = `
  .camera-options-wrap {
    margin-top: 4px;
    overflow-x: hidden;
  }

  .camera-options-table {
    width: 100%;
    min-width: 0;
    table-layout: fixed;
  }

  .camera-options-table th:nth-child(1),
  .camera-options-table td:nth-child(1) { width: 18%; }

  .camera-options-table th:nth-child(2),
  .camera-options-table td:nth-child(2),
  .camera-options-table th:nth-child(3),
  .camera-options-table td:nth-child(3) { width: 33%; }

  .camera-options-table th:nth-child(4),
  .camera-options-table td:nth-child(4) { width: 16%; }

  .camera-options-table th,
  .camera-options-table td {
    min-width: 0;
  }

  .camera-options-table td:first-child {
    overflow-wrap: anywhere;
  }

  .camera-options-table select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .camera-options-table th:last-child,
  .camera-options-table td:last-child {
    width: 122px;
    max-width: 122px;
    text-align: center;
  }

  .camera-options-table .action { white-space: nowrap; }

  .camera-options-table .camera-copy-rtsp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 7px 10px;
    border: 0;
    border-radius: 8px;
    color: var(--navy);
    background: #efeded;
    font: inherit;
    font-weight: 600;
    white-space: nowrap;
  }

  .camera-options-table .camera-copy-rtsp svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }

  .mobile-key-primary-controls { display: none; }

  .key-filter-toolbar { display: flex; margin: 12px 0 0; }
  .key-filter-toolbar .mobile-filter-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 7px 12px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 9px;
    color: var(--primary-text-color);
    background: var(--card-background-color, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .activity-controls.key-filter-panel { display: none; margin: 10px 0 12px; padding: 12px; border: 1px solid var(--divider-color, #8c99a3); border-radius: 10px; background: var(--secondary-background-color, #f7f8f9); }
  .activity-controls.key-filter-panel.mobile-filter-panel-open { display: flex; }

  /* Activity Thumbnails & Lightbox */
  .activity-thumbnail {
    position: relative;
    display: grid;
    align-content: center;
    place-items: center;
    width: 76px;
    height: 52px;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: 7px;
    background: var(--secondary-background-color, #dbe5ea);
  }

  .activity-thumbnail img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: cover;
    object-position: center center;
    transform: var(--camera-orientation-transform, none);
  }

  [data-orientation="rotate_90"] { --camera-orientation-transform: rotate(90deg); }
  [data-orientation="rotate_180"] { --camera-orientation-transform: rotate(180deg); }
  [data-orientation="rotate_270"] { --camera-orientation-transform: rotate(270deg); }
  [data-orientation="flip_horizontal"] { --camera-orientation-transform: scaleX(-1); }
  [data-orientation="flip_vertical"] { --camera-orientation-transform: scaleY(-1); }
  [data-orientation="flip_horizontal_and_rotate_90"] { --camera-orientation-transform: rotate(90deg) scaleX(-1); }
  [data-orientation="flip_vertical_and_rotate_90"] { --camera-orientation-transform: rotate(90deg) scaleY(-1); }

  .activity-thumbnail svg {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 17px;
    height: 17px;
    padding: 3px;
    border-radius: 50%;
    color: white;
    background: #003b5ccc;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .thumbnail-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid color-mix(in srgb, var(--aqua) 25%, transparent);
    border-top-color: var(--aqua);
    border-radius: 50%;
    animation: thumbnail-spin 0.8s linear infinite;
  }

  @keyframes thumbnail-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .activity-thumbnail-error {
    display: grid;
    place-items: center;
    width: 76px;
    height: 52px;
    border-radius: 7px;
    color: var(--error-color, #dc2626);
    background: color-mix(in srgb, var(--error-color, #dc2626) 10%, transparent);
    font-size: 12px;
    font-weight: 700;
  }

  .activity-image-dialog {
    /* Keep the lightbox in the visual viewport rather than the panel's
       document flow when the activity table has been scrolled. */
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(760px, calc(100vw - 32px));
    padding: 12px;
  }

  .activity-image-dialog h2 {
    margin: 0 0 8px;
  }

  .activity-image-dialog .modal-actions {
    margin-top: 8px;
  }

  .activity-image-dialog img {
    display: block;
    width: 100%;
    max-height: 75vh;
    object-fit: contain;
    border-radius: 8px;
    transform: var(--camera-orientation-transform, none);
  }

  .activity-image-cell { text-align: left; }

  .activity-image-details {
    margin: 10px 44px 0;
    font-weight: 600;
    text-align: center;
  }

  .activity-image-nav {
    position: absolute;
    z-index: 2;
    top: 50%;
    transform: translateY(-50%);
    width: 38px;
    height: 48px;
    border: 0;
    border-radius: 8px;
    color: white;
    background: #003b5ccc;
    font-size: 30px;
    line-height: 1;
  }

  .activity-image-nav:hover {
    background: #003b5c;
  }

  .activity-image-nav.previous {
    left: 12px;
  }

  .activity-image-nav.next {
    right: 12px;
  }

  /* Temporary Keys View */
  .key-heading {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .key-heading-copy .muted {
    margin: 4px 0 0;
  }

  .key-heading-actions {
    display: flex;
    flex-wrap: nowrap;
    grid-column: 2;
    justify-self: end;
    justify-content: flex-end;
    gap: 8px;
  }

  .key-select-action,
  .add-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    border: 0;
    border-radius: 9px;
    padding: 8px 13px;
    font: inherit;
    font-weight: 700;
    gap: 7px;
  }

  .key-select-action {
    border: 1px solid var(--divider-color, #8c99a3);
    color: var(--primary-text-color);
    background: var(--card-background-color, #fff);
  }

  .key-select-action.is-selecting,
  .key-select-action[aria-pressed="true"] {
    color: #006b9f;
    background: #fff;
    box-shadow: 0 2px 7px rgb(0 0 0 / 12%);
  }

  .key-select-action svg,
  .add-key svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }

  .add-key {
    color: #fff;
    background: #006b9f;
    box-shadow: 0 2px 5px rgb(0 59 92 / 20%);
  }

  .add-key:hover { background: #00577f; }

  .key-heading-actions .view-mode-toggle {
    flex-basis: 154px;
    width: 154px;
    min-height: 38px;
    padding: 3px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
  }

  .key-heading-actions .mobile-filter-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 7px 12px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 9px;
    color: var(--primary-text-color);
    background: var(--card-background-color, #fff);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .key-heading-actions .view-mode-toggle .action {
    min-height: 32px;
    border-radius: 8px;
  }

  .key-filter-input {
    box-sizing: border-box;
    min-width: 150px;
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid var(--divider-color, #8c99a3);
    border-radius: 10px;
    color: var(--primary-text-color, inherit);
    background: var(--card-background-color, #fff);
    font: inherit;
    font-size: 14px;
    font-weight: 400;
  }

  .key-filter-input:focus-visible {
    outline: 2px solid var(--aqua);
    outline-offset: 2px;
  }

  .key-row-selected {
    background: color-mix(in srgb, var(--aqua) 12%, transparent);
  }

  .key-select-cell {
    width: 36px;
    text-align: center;
  }

  .key-select-cell input {
    width: 18px;
    height: 18px;
    accent-color: var(--aqua);
  }

  .key-code,
  .copied-code {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .copied-code {
    color: #62d394;
    font-weight: 700;
  }

  .copied-code svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
  }

  .copy-code {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    color: var(--aqua);
    background: transparent;
  }

  .copy-code:hover {
    background: color-mix(in srgb, var(--aqua) 15%, transparent);
  }

  .copy-code svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .key-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .key-menu-button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
  }

  .key-modal-form {
    display: grid;
    gap: 14px;
  }

  .key-modal-form > label,
  .key-modal-form .key-form-extra-fields > label,
  .key-modal-form .readonly-key-field,
  .key-modal-form .key-relay-row {
    display: grid;
    grid-template-columns: minmax(30px, 42%) minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    width: min(100%, 480px);
    margin-inline: auto;
  }

  .key-modal-form > label {
    font-weight: 600;
  }

  .key-modal-form .key-form-extra-fields,
  .key-modal-form .readonly-key-fields {
    display: grid;
    gap: 14px;
  }

  .key-modal-form .readonly-key-field > strong {
    text-align: left;
  }

  .key-modal-form .key-relay-row > span {
    color: var(--secondary-text-color, #6b7280);
    font-weight: 600;
  }

  .key-modal-form fieldset.key-relay-row {
    box-sizing: border-box;
  }

  .key-modal-form fieldset.key-relay-row legend {
    grid-column: 1;
    color: var(--secondary-text-color, #6b7280);
    font-weight: 600;
  }

  .key-modal-form fieldset.key-relay-row .relay-options {
    grid-column: 2;
    grid-row: 1;
  }

  .key-modal-form .relay-options {
    margin: 0;
  }

  .key-modal-form .modal-actions {
    width: min(100%, 480px);
    margin-inline: auto;
  }

  .key-create-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-left: 8px;
    vertical-align: -2px;
    border: 2px solid rgb(255 255 255 / 45%);
    border-top-color: #fff;
    border-radius: 50%;
    animation: thumbnail-spin 0.8s linear infinite;
  }

  .key-create-spinner[hidden] { display: none; }

  .field-input-wrap {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    align-items: flex-start;
    text-align: left;
  }

  .field-input-wrap input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
  }

  .field-error {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.3;
    font-weight: 500;
    color: var(--error-color, #dc2626);
    text-align: left;
    word-break: break-word;
  }

  .field-error[hidden] {
    display: none !important;
  }

  .required-asterisk {
    color: var(--error-color, #dc2626);
    font-size: 17px;
    line-height: 0;
  }

  .temporary-key-qr-dialog {
    width: min(456px, calc(60vw - 20px));
  }

  .temporary-key-qr-content {
    display: grid;
    grid-template: 1fr / 1fr;
    width: 100%;
    aspect-ratio: 1;
    place-items: center;
  }

  .temporary-key-qr-content img {
    grid-area: 1 / 1;
    width: 100%;
    height: 100%;
    max-height: none;
    object-fit: contain;
  }

  .temporary-key-qr-loading {
    display: grid;
    grid-area: 1 / 1;
    place-items: center;
    width: 100%;
    height: 100%;
  }

  .temporary-key-qr-spinner {
    width: 38px;
    height: 38px;
    border: 4px solid color-mix(in srgb, var(--aqua, #03a9f4) 22%, transparent);
    border-top-color: var(--aqua, #03a9f4);
    border-radius: 50%;
    animation: temporary-key-qr-spin .8s linear infinite;
  }

  @keyframes temporary-key-qr-spin { to { transform: rotate(360deg); } }

  @media (max-width: 600px) {
    .camera-options-table th,
    .camera-options-table td { padding: 8px 4px; font-size: 12px; }
    .camera-options-table th:nth-child(1),
    .camera-options-table td:nth-child(1) { width: 15%; }
    .camera-options-table th:nth-child(2),
    .camera-options-table td:nth-child(2),
    .camera-options-table th:nth-child(3),
    .camera-options-table td:nth-child(3) { width: 34%; }
    .camera-options-table th:last-child,
    .camera-options-table td:last-child { width: 17%; max-width: none; }
    .camera-options-table select { padding-inline: 5px; font-size: 12px; }
    .camera-options-table .camera-copy-rtsp { min-width: 34px; min-height: 34px; padding: 7px; }
    .camera-options-table .camera-copy-rtsp span { display: none; }

    .key-heading {
      grid-template-columns: 1fr;
    }
    .key-heading-actions {
      display: none;
    }
    .mobile-key-primary-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
      gap: 8px;
      margin: 14px 0 16px;
    }
    .mobile-key-primary-controls .mobile-filter-toggle,
    .mobile-key-primary-controls .key-select-action,
    .mobile-key-primary-controls .add-key {
      min-height: 38px;
      margin: 0;
    }
    .mobile-key-primary-controls .add-key { min-width: 0; }
    .mobile-key-primary-controls .danger { grid-column: 1 / -1; }
    .key-filter-toolbar { display: none; }

    .remote-instances-section .credential-share-receiver-row {
      align-items: flex-start;
      gap: 8px;
    }
    .remote-instances-section .credential-share-status {
      flex: 1 1 auto;
      min-width: 0;
      white-space: normal;
    }
    .remote-instances-section .credential-share-status small {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 4px 8px;
      margin-top: 3px;
    }
    .remote-instances-section .credential-share-status .credential-share-separator { display: none; }
    .remote-instances-section .credential-share-status small > span:last-child { grid-column: 1 / -1; }
    .remote-instances-section .credential-share-actions { flex: 0 0 auto; margin-right: 0; }
  }

  @media (min-width: 601px) and (max-width: 1000px) {
    .key-heading { grid-template-columns: 1fr; gap: 12px; }
    .key-heading-actions { grid-column: 1; justify-self: start; }
  }

  @media (max-width: 500px) {
    .key-modal-form > label,
    .key-modal-form .key-form-extra-fields > label,
    .key-modal-form .readonly-key-field,
    .key-modal-form .key-relay-row {
      grid-template-columns: 1fr;
      gap: 5px;
    }
    .key-modal-form fieldset.key-relay-row .relay-options {
      grid-column: 1;
      grid-row: auto;
    }
  }

  /* Settings View */
  .automations-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }

  .automations-heading h2, .automation-row h3 { margin: 0; }
  .automations-heading p { margin: 5px 0 2px; color: var(--primary-text-color); font-size: 13px; font-weight: 700; }
  .automations-heading > div > span { color: var(--panel-muted); font-size: 14px; }
  .automations-heading .action {
    display: inline-flex;
    flex: 0 0 auto;
    align-self: flex-start;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    height: 36px;
    padding: 0 12px;
    color: #fff;
    background: #006b9f;
    box-shadow: 0 2px 5px rgb(0 59 92 / 20%);
    white-space: nowrap;
  }
  .automations-heading .action svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
  .automations-heading .action:hover { background: #00577f; }
  .automation-list { display: grid; gap: 9px; }
  .automation-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 15px;
    border: 1px solid #62c78c;
    border-radius: 12px;
    background: var(--panel-surface);
  }
  .automation-row.is-disabled { opacity: .68; }
  .automation-row-icon, .automation-empty-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    color: #18733d;
    background: #d8f4e4;
  }
  .automation-row-icon svg, .automation-empty-icon svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; }
  .automation-row.is-disabled .automation-row-icon { color: #59656e; background: #efeded; }
  .automation-row-copy { min-width: 0; }
  .automation-row-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .automation-status { padding: 3px 7px; border-radius: 999px; color: #176b45; background: #d8f4e4; font-size: 11px; font-weight: 700; }
  .automation-status.is-disabled { color: #59656e; background: #efeded; }
  .automation-doors { margin: 4px 0 0; color: var(--panel-muted); font-size: 14px; overflow-wrap: anywhere; }
  .automation-metadata { display: flex; flex-wrap: wrap; gap: 5px 18px; margin-top: 9px; color: var(--panel-muted); font-size: 12px; }
  .automation-metadata span { display: flex; gap: 5px; }
  .automation-metadata b { color: var(--primary-text-color); font-weight: 650; }
  .automation-row-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .automation-icon-action { display: inline-grid; box-sizing: border-box; place-items: center; width: 36px; min-width: 36px; height: 36px; min-height: 36px; padding: 7px; border: 0; border-radius: 8px; color: var(--panel-muted); background: transparent; }
  .automation-icon-action:hover { color: var(--panel-text); background: #efeded; }
  .automation-icon-action svg { width: 18px; height: 18px; }
  .automation-delete { color: var(--error-color, #ba1a1a); }
  .automation-delete:hover { color: var(--error-color, #ba1a1a); background: color-mix(in srgb, var(--error-color, #ba1a1a) 10%, transparent); }
  .automation-empty { display: grid; justify-items: center; padding: 32px 18px; border: 1px dashed var(--panel-outline); border-radius: 12px; text-align: center; }
  .automation-empty h3 { margin: 12px 0 0; }
  .automation-empty p { max-width: 380px; margin: 6px 0 16px; color: var(--panel-muted); }

  @media (max-width: 600px) {
    .automations-heading { align-items: stretch; flex-direction: column; }
    .automation-row { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
    .automation-row-actions { justify-content: flex-end; }
    .automation-row-actions { grid-column: 1 / -1; }
    .automation-metadata { display: grid; gap: 4px; }
  }

  :host([dark]) .automation-row { border-color: #62c78c; background: var(--secondary-background-color); }
  :host([dark]) .automation-row.is-disabled { border-color: var(--panel-outline); background: #20242b; }
  :host([dark]) .automation-row-icon, :host([dark]) .automation-empty-icon { color: #86efac; background: #143b2b; }
  :host([dark]) .automation-row.is-disabled .automation-row-icon { color: var(--panel-muted); background: #252b34; }
  :host([dark]) .automation-status { color: #86efac; background: #143b2b; }
  :host([dark]) .automation-status.is-disabled { color: var(--panel-muted); background: #252b34; }
  :host([dark]) .automation-icon-action { color: var(--panel-muted); background: transparent; }
  :host([dark]) .automation-icon-action:hover { color: var(--panel-text); background: #303a46; }
  :host([dark]) .automation-delete { color: #fca5a5; }
  :host([dark]) .automation-delete:hover { color: #fecaca; background: #4a2028; }

  .secret-input {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .secret-input input {
    min-width: 0;
    border-radius: 8px 0 0 8px;
  }

  .secret-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    border: 1px solid var(--divider-color, #bbb);
    border-left: 0;
    border-radius: 0 8px 8px 0;
    color: inherit;
    background: var(--card-background-color, #fff);
  }

  .secret-toggle svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .activity-storage-limit {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    min-width: 0;
  }

  .activity-storage-limit-row {
    font-weight: 400;
  }

  .activity-storage-limit input {
    flex: 0 0 auto;
    width: calc(var(--storage-limit-digits, 1) * 1ch + 2.75rem);
    min-width: 4.25rem;
  }

  .activity-storage-limit-unit {
    margin-left: -6px;
    font-weight: 400;
  }

  .activity-storage-limit > [data-activity-storage-progress] {
    display: contents;
  }

  .activity-storage-used {
    color: var(--secondary-text-color, #6b7280);
    font-size: 14px;
    font-weight: 400;
  }

  .activity-storage-transfer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    min-width: 0;
  }

  .activity-storage-limit-description {
    min-width: 0;
    color: var(--secondary-text-color, #6b7280);
    font-size: 14px;
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .sip-warning {
    margin: 0 0 12px;
    color: var(--error-color, #b91c1c);
    font-weight: 700;
  }

  .sip-section .sip-warning {
    margin: 16px 0 18px;
    padding: 12px 14px;
    border-radius: 7px;
    color: #b42318;
    background: #fff0ef;
  }

  .sip-account-grid {
    display: grid;
    grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1.2fr);
    gap: 8px 14px;
    align-items: center;
    margin-bottom: 14px;
  }

  .sip-account-grid code {
    overflow-wrap: anywhere;
    padding: 5px 7px;
    border-radius: 5px;
    background: var(--secondary-background-color, #e8eef1);
    color: inherit;
  }

  dialog .sip-warning { text-align: left; }
  dialog .form-error { color: var(--error-color, #b91c1c); font-weight: 700; }

  @media (max-width: 500px) {
    .sip-account-grid { grid-template-columns: 1fr; gap: 4px; }
  }

  .activity-storage-progress {
    position: relative;
    flex: 1 1 220px;
    min-width: 180px;
    max-width: 300px;
    height: 34px;
    overflow: hidden;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 8px;
    background: var(--secondary-background-color, #e8eef1);
  }

  .activity-storage-progress-fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--aqua, #55bfe6);
    transition: width 160ms ease;
  }

  .activity-storage-progress.is-over-limit .activity-storage-progress-fill {
    background: var(--error-color, #c62828);
  }

  .activity-storage-limit-warning {
    margin: 0 0 8px;
    color: var(--error-color, #b91c1c);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
  }

  .activity-storage-progress-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0 8px;
    color: var(--primary-text-color, #111);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
  }

  .activity-storage-progress.is-over-limit .activity-storage-progress-label {
    color: white;
  }

  .activity-storage-warning {
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid #d49a19;
    border-radius: 8px;
    /* This alert deliberately uses a light warning surface in both themes.
       Do not inherit Home Assistant's light dark-theme foreground color. */
    color: #342500;
    background: #fff4cf;
    font-size: 14px;
    line-height: 1.45;
  }

  .activity-storage-warning strong {
    margin-right: 4px;
  }

  .activity-storage-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    font-weight: 700;
    white-space: nowrap;
  }

  .activity-storage-action svg {
    display: block;
    flex: 0 0 17px;
    width: 17px;
    height: 17px;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }

  .activity-storage-clear { background: #c62828; }
  .activity-storage-clear:hover { background: #a91f1f; }

  @media (max-width: 600px) {
    .activity-storage-transfer-actions {
      display: flex;
      flex: 1 0 100%;
      gap: 12px;
    }
  }
  .activity-storage-download { background: #55bfe6; }
  .activity-storage-download:hover { background: #55bfe6; }
  .activity-storage-import { background: #55bfe6; }
  .activity-storage-import:hover { background: #55bfe6; }

  @media (max-width: 500px) {
    .activity-storage-limit {
      flex-wrap: wrap;
    }

    .activity-storage-progress {
      flex-basis: 100%;
    }
  }

  /* Help View */
  .help-card {
    display: grid;
    gap: 20px;
    max-width: 820px;
  }

  .help-card h2 {
    font-size: 20px;
  }

  .help-card h3 {
    margin: 0 0 6px;
    font-size: 16px;
  }

  .help-card p {
    margin: 0;
  }

  .help-list {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 6px;
  }

  .help-link {
    color: var(--aqua);
    font-weight: 700;
  }

  .disclaimer {
    padding: 14px;
    border-left: 4px solid var(--aqua);
    border-radius: 8px;
    background: var(--secondary-background-color, #eef7fa);
  }

  .bmc-banner {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-top: 10px;
    min-height: 44px;
    padding: 0 17px;
    border-radius: 10px;
    color: #111;
    background: #ffdd00;
    box-shadow: 0 2px 0 #c9a800;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
  }

  .bmc-banner:hover {
    background: #ffe238;
  }

  .bmc-banner:focus-visible {
    outline: 2px solid var(--aqua);
    outline-offset: 3px;
  }

  .bmc-banner-icon {
    font-size: 21px;
    line-height: 1;
  }

  form .credential-share-link-row {
    display: flex !important;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    margin-top: 6px;
    min-width: 0;
  }

  form .credential-share-link-heading {
    display: block;
    grid-column: 1 / -1;
    white-space: nowrap;
  }

  .credential-share-link-name {
    flex: 0 0 110px;
    overflow: hidden;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  form .credential-share-link-row input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1 1 auto;
    width: auto;
  }

  form .credential-share-link-row .action {
    flex: 0 0 auto;
  }

  .credential-share-receivers {
    margin-top: 16px;
  }

  .credential-share-receivers h3 {
    margin: 0 0 8px;
    font-size: 1rem;
  }

  .credential-share-receiver-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--divider-color, #ddd);
  }

  .credential-share-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .credential-share-receiver-row .credential-share-status {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    white-space: nowrap;
  }

  .credential-share-receiver-row .credential-share-status small {
    color: var(--secondary-text-color, #666);
  }
  .credential-share-status.connected strong { color: #16803c; }
  .credential-share-status.waiting strong { color: #a36a00; }
  .credential-share-status.disconnected strong { color: #c23131; }

  .credential-share-source-status {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 10px 0 0;
  }

  .credential-share-source-status.connected strong { color: #16803c; }
  .credential-share-source-status.waiting strong { color: #a36a00; }

  :host([dark]) input,
  :host([dark]) select,
  :host([dark]) textarea,
  :host([dark]) .pairing-link-value {
    border-color: var(--panel-outline);
    color: var(--panel-text);
    background: var(--input-fill-color);
  }

  :host([dark]) th,
  :host([dark]) .credential-share-receiver-row,
  :host([dark]) .sip-details-grid section,
  :host([dark]) .key-tile,
  :host([dark]) .table-wrap {
    border-color: var(--panel-outline);
    color: var(--panel-text);
    background: var(--secondary-background-color);
  }

  :host([dark]) td,
  :host([dark]) .sip-details-grid dl > div,
  :host([dark]) .key-tile-code,
  :host([dark]) .credential-share-link-row {
    border-color: var(--panel-outline);
    color: var(--panel-text);
    background: var(--panel-card);
  }

  :host([dark]) .settings-discard,
  :host([dark]) .sip-export,
  :host([dark]) .camera-copy-rtsp,
  :host([dark]) .key-select-action,
  :host([dark]) .mobile-filter-toggle,
  :host([dark]) .view-mode-toggle {
    border-color: var(--panel-outline);
    color: var(--panel-text);
    background: #252c35;
  }

  :host([dark]) .settings-discard:hover:not(:disabled),
  :host([dark]) .sip-export:hover,
  :host([dark]) .camera-copy-rtsp:hover,
  :host([dark]) .key-select-action:hover {
    background: #303a46;
  }

  :host([dark]) .view-mode-toggle .action {
    color: #cbd5e1;
    opacity: 1;
  }

  :host([dark]) .view-mode-toggle .action:hover:not(.active) {
    color: #f3f4f6;
    background: #303a46;
  }

  :host([dark]) .sip-warning,
  :host([dark]) .share-access-dialog .share-error {
    color: #fecaca;
    background: #431d25;
  }

  :host([dark]) .credential-share-receiver-row.disconnected .credential-share-status small em {
    color: #fecaca;
    background: #4a2028;
  }

  :host([dark]) .credential-share-receiver-row.connected .credential-share-status small em {
    color: #bbf7d0;
    background: #143b2b;
  }

  :host([dark]) .device-status.ready,
  :host([dark]) .key-status.active,
  :host([dark]) .call-status.answered {
    color: #86efac;
    background: #143b2b;
  }

  :host([dark]) .device-status.unavailable,
  :host([dark]) .key-status.expired,
  :host([dark]) .call-status.missed {
    color: #fecaca;
    background: #4a2028;
  }

  :host([dark]) .device-status.loading {
    color: var(--panel-muted);
    background: #252b34;
  }

  :host([dark]) .settings-switch span {
    background: #374151;
  }

  :host([dark]) .settings-switch span::after {
    background: #9ca3af;
  }

  :host([dark]) .settings-switch input:checked + span {
    background: #0284c7;
  }

  :host([dark]) .settings-switch input:checked + span::after {
    background: #38bdf8;
  }

  /* Device and temporary-key tiles retain a few deliberately light accents in
     their base styles. Keep their dark treatment aligned with the panel palette. */
  :host([dark]) .device-preview,
  :host([dark]) .device-preview.unavailable {
    background: #222731;
  }

  :host([dark]) .tile-actions .device-monitor-action,
  :host([dark]) .device-table .device-monitor-action {
    color: #c4b5fd;
    background: #2e2744;
  }

  :host([dark]) .tile-actions .device-unlock-action,
  :host([dark]) .device-table .device-unlock-action {
    color: #fca5a5;
    background: #3f252b;
  }

  :host([dark]) .view-mode-toggle .action.active,
  :host([dark]) .view-mode-toggle .action[aria-pressed="true"] {
    color: #38bdf8;
    background: #1c2026;
    box-shadow: 0 2px 7px rgb(0 0 0 / 30%);
  }

  :host([dark]) .mobile-filter-toggle[aria-expanded="true"] {
    color: #38bdf8;
    background: #1c2026;
    box-shadow: 0 2px 7px rgb(0 0 0 / 30%);
  }

  :host([dark]) .key-select-action.is-selecting,
  :host([dark]) .key-select-action[aria-pressed="true"] {
    color: #38bdf8;
    background: #1c2026;
    box-shadow: 0 2px 7px rgb(0 0 0 / 30%);
  }

  :host([dark]) .key-tile-expired {
    border-color: var(--panel-outline);
    background: #20242b;
    opacity: .88;
  }

  :host([dark]) .key-tile:hover,
  :host([dark]) .key-tile-expired:hover {
    border-color: #374151;
  }

  :host([dark]) .key-tile-title-group h3,
  :host([dark]) .key-tile-validity dd {
    color: var(--panel-text);
  }

  :host([dark]) .key-tile .tile-grab,
  :host([dark]) .key-tile .key-menu-button,
  :host([dark]) .key-tile-code span,
  :host([dark]) .key-tile-validity dt,
  :host([dark]) .key-tile-usage > div {
    color: var(--panel-muted);
  }

  :host([dark]) .key-tile .key-menu-button:hover,
  :host([dark]) .key-tile-code .copy-code {
    color: var(--panel-text);
    background: #252b34;
  }

  :host([dark]) .key-tile-code .copy-code:hover {
    color: #e5e7eb;
    background: #303a46;
  }

  :host([dark]) .key-tile-usage {
    border-color: var(--panel-outline);
    background: transparent;
  }

  :host([dark]) .key-tile-usage > i {
    background: #374151;
  }

  :host([dark]) .key-tile-expired .key-tile-usage strong {
    color: var(--panel-muted);
  }

  :host([dark]) button:focus-visible,
  :host([dark]) input:focus-visible,
  :host([dark]) select:focus-visible,
  :host([dark]) textarea:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }
  :host([dir="rtl"]) .activity-image-cell,
  :host([dir="rtl"]) .activity-detail,
  :host([dir="rtl"]) .call-detail,
  :host([dir="rtl"]) .key-detail,
  :host([dir="rtl"]) dialog .sip-warning { text-align: right; }
  :host([dir="rtl"]) .activity-image-nav.previous { left: auto; right: 12px; }
  :host([dir="rtl"]) .activity-image-nav.next { right: auto; left: 12px; }
  :host([dir="rtl"]) .automation-card { border-left: 0; border-right: 4px solid var(--aqua); }
  :host([dir="rtl"]) .automation-card-icon { margin-left: 0; margin-right: 8px; }
  :host([dir="rtl"]) .key-status-badge { margin-left: 0; margin-right: 4px; }
  :host([dir="rtl"]) .key-filter-toolbar { padding-left: 0; padding-right: 20px; }
`;
