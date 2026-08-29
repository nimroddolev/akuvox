/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20260829-settings-save-tall";
import { tableStyles } from "./tables.css.js?v=20260829-activity-status-compact";
import { dialogStyles } from "./dialogs.css.js?v=20260817-range-picker";
import { viewStyles } from "./views.css.js?v=20260826-storage-limit-warning-row";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
