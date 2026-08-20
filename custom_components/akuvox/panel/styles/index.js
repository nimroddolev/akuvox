/**
 * Aggregates all panel CSS modules.
 */

import { mainStyles } from "./main.css.js?v=20260820-mobile-header1";
import { tableStyles } from "./tables.css.js";
import { dialogStyles } from "./dialogs.css.js?v=20260817-range-picker";
import { viewStyles } from "./views.css.js?v=20260820-activity-orientation-fix";

export const getPanelStyles = () => `
  <style>
    ${mainStyles}
    ${tableStyles}
    ${dialogStyles}
    ${viewStyles}
  </style>
`;
