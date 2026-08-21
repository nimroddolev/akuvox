/**
 * View-specific styling: Activity thumbnails, Secret inputs, Key management, Help page.
 */

export const viewStyles = `
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

  :host([data-mirror-activity-images]) .activity-thumbnail img,
  :host([data-mirror-activity-images]) .activity-image-dialog img {
    transform: var(--camera-orientation-transform, none) scaleX(-1);
  }

  :host([data-mirror-activity-images]) .activity-thumbnail img[data-orientation]:not([data-orientation="none"]),
  :host([data-mirror-activity-images]) .activity-image-dialog img[data-orientation]:not([data-orientation="none"]) {
    transform: var(--camera-orientation-transform, none);
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
    position: relative;
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

  .key-heading-actions {
    display: flex;
    flex-wrap: wrap;
    grid-column: 2;
    justify-self: end;
    justify-content: flex-end;
    gap: 8px;
  }

  .add-key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .add-key .plus {
    font-size: 20px;
    font-weight: 800;
    line-height: 12px;
  }

  .key-filter-input {
    box-sizing: border-box;
    min-width: 180px;
    padding: 8px;
    border: 1px solid var(--divider-color, #bbb);
    border-radius: 8px;
    color: inherit;
    background: var(--card-background-color, #fff);
    font: inherit;
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

  @media (max-width: 600px) {
    .key-heading {
      grid-template-columns: 1fr;
    }
    .key-heading-actions {
      grid-column: 1;
      justify-self: stretch;
    }
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
    gap: 12px;
    min-width: 0;
  }

  .activity-storage-limit-row {
    font-weight: 400;
  }

  .activity-storage-limit input {
    flex: 0 0 120px;
    width: 120px;
  }

  .activity-storage-limit > [data-activity-storage-progress] {
    display: contents;
  }

  .activity-storage-limit-description {
    color: var(--secondary-text-color, #6b7280);
    font-size: 14px;
    font-weight: 400;
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

  .activity-storage-warning {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 1px solid #d49a19;
    border-radius: 8px;
    color: var(--primary-text-color, #342500);
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
  .activity-storage-download { background: #1976d2; }
  .activity-storage-download:hover { background: #1565b7; }

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
`;
