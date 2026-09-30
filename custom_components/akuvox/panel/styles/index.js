/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20260928-connected-node-row-margins";
import { tableStyles } from "./tables.css.js?v=20260928-camera-preview-fixed-layers";
import { dialogStyles } from "./dialogs.css.js?v=20260928-mobile-key-header-height";
import { viewStyles } from "./views.css.js?v=20260928-activity-mobile-filter";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
