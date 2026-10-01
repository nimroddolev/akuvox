/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20261001-sticky-settings-actions";
import { tableStyles } from "./tables.css.js?v=20261001-stable-device-tile-hover";
import { dialogStyles } from "./dialogs.css.js?v=20260928-mobile-key-header-height";
import { viewStyles } from "./views.css.js?v=20261001-activity-storage-warning-contrast";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
